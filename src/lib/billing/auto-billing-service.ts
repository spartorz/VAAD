import { Types } from 'mongoose';
import Apartment from '@/models/Apartment';
import Charge from '@/models/Charge';
import Building from '@/models/Building';
import AutoBillingSettings from '@/models/AutoBillingSettings';
import { createAuditLog } from '@/lib/api-utils';
import {
  AutoBillingMode,
  AutoBillingPreviewResult,
  AutoBillingRunResult,
  AutoBillingApartmentResult,
} from './auto-billing-types';

interface PreviewInput {
  buildingId: string;
  period?: string;
  mode?: AutoBillingMode;
  excludeApartmentIds?: string[];
  monthlyAmountOverride?: number;
}

interface RunInput extends PreviewInput {
  actorUserId: string;
  actorName?: string;
  mode: Exclude<AutoBillingMode, 'preview'>;
  confirm: boolean;
}

export interface AutoBillingSettingsResolved {
  autoBillingEnabled: boolean;
  monthlyAmount?: number;
  currency: string;
  chargeDayOfMonth: number;
  dueDayOfMonth: number;
  descriptionTemplate: string;
  requireApprovalBeforeGeneration: boolean;
  activeApartmentStatuses: string[];
  lastAutoBillingRunAt?: Date;
  nextAutoBillingRunAt?: Date;
}

function getCurrentPeriodByTimezone(timezone: string) {
  const now = new Date();
  const year = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric' }).format(now);
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, month: '2-digit' }).format(now);
  return `${year}-${month}`;
}

function getDueDate(period: string, day: number) {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function renderDescription(template: string, period: string) {
  return template.replace(/\{period\}/g, period);
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: number }).code === 11000
  );
}

function getTodayInTimezone(timezone: string): number {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, day: '2-digit' }).format(new Date());
  return Number(day);
}

export async function getOrCreateAutoBillingSettings(buildingId: string): Promise<AutoBillingSettingsResolved> {
  const building = await Building.findById(buildingId).select('settings.currency timezone').lean();
  if (!building) {
    throw new Error('Building not found');
  }

  const raw = await AutoBillingSettings.findOne({ buildingId: new Types.ObjectId(buildingId) }).lean();
  const fallbackCurrency = building.settings?.currency || 'ILS';

  return {
    autoBillingEnabled: raw?.autoBillingEnabled ?? false,
    monthlyAmount: raw?.monthlyAmount,
    currency: raw?.currency || fallbackCurrency,
    chargeDayOfMonth: raw?.chargeDayOfMonth ?? 1,
    dueDayOfMonth: raw?.dueDayOfMonth ?? 10,
    descriptionTemplate: raw?.descriptionTemplate || 'דמי ועד בית עבור {period}',
    requireApprovalBeforeGeneration: raw?.requireApprovalBeforeGeneration ?? true,
    activeApartmentStatuses: raw?.activeApartmentStatuses?.length ? raw.activeApartmentStatuses : ['active'],
    lastAutoBillingRunAt: raw?.lastAutoBillingRunAt,
    nextAutoBillingRunAt: raw?.nextAutoBillingRunAt,
  };
}

export async function buildAutoBillingPreview(input: PreviewInput): Promise<AutoBillingPreviewResult> {
  const building = await Building.findById(input.buildingId).select('timezone settings.currency').lean();
  if (!building) {
    throw new Error('Building not found');
  }

  const settings = await getOrCreateAutoBillingSettings(input.buildingId);
  const period = input.period || getCurrentPeriodByTimezone(building.timezone || 'Asia/Jerusalem');
  const dueDate = getDueDate(period, settings.dueDayOfMonth);
  const excludedIds = new Set((input.excludeApartmentIds || []).filter(Boolean));
  const amount = input.monthlyAmountOverride ?? settings.monthlyAmount;

  const apartments = await Apartment.find({
    buildingId: new Types.ObjectId(input.buildingId),
  })
    .select('_id number floor status')
    .sort({ number: 1 })
    .lean();

  const allApartmentIds = apartments.map((apt) => apt._id);
  const existingCharges = await Charge.find({
    buildingId: new Types.ObjectId(input.buildingId),
    apartmentId: { $in: allApartmentIds },
    type: 'monthly_due',
    period,
    status: 'open',
  })
    .select('apartmentId')
    .lean();
  const existingApartmentIdSet = new Set(existingCharges.map((c) => c.apartmentId.toString()));

  const eligibleApartments: AutoBillingApartmentResult[] = [];
  const skippedApartments: AutoBillingApartmentResult[] = [];
  const eligibleStatuses = new Set(settings.activeApartmentStatuses);

  for (const apt of apartments) {
    const aptId = apt._id.toString();
    const base = {
      apartmentId: aptId,
      apartmentNumber: apt.number,
      floor: apt.floor,
      status: apt.status,
    };

    if (!eligibleStatuses.has(apt.status)) {
      skippedApartments.push({ ...base, reason: 'inactive_apartment' });
      continue;
    }
    if (excludedIds.has(aptId)) {
      skippedApartments.push({ ...base, reason: 'apartment_excluded' });
      continue;
    }
    if (!amount || amount <= 0) {
      skippedApartments.push({ ...base, reason: 'missing_billing_amount' });
      continue;
    }
    if (existingApartmentIdSet.has(aptId)) {
      skippedApartments.push({ ...base, reason: 'charge_already_exists' });
      continue;
    }

    eligibleApartments.push({ ...base, amount });
  }

  return {
    period,
    currency: settings.currency,
    dueDate: dueDate.toISOString(),
    eligibleCount: eligibleApartments.length,
    skippedCount: skippedApartments.length,
    totalAmount: eligibleApartments.reduce((sum, apt) => sum + (apt.amount || 0), 0),
    eligibleApartments,
    skippedApartments,
  };
}

export async function runAutoBilling(input: RunInput): Promise<AutoBillingRunResult> {
  const preview = await buildAutoBillingPreview(input);
  const settings = await getOrCreateAutoBillingSettings(input.buildingId);

  if (!input.confirm) {
    throw new Error('Confirmation is required');
  }

  const approvalRequired = settings.requireApprovalBeforeGeneration;
  if (approvalRequired) {
    return {
      ...preview,
      mode: input.mode,
      approvalRequired: true,
      createdCount: 0,
      skippedExistingCount: 0,
      createdChargeIds: [],
    };
  }

  const createdChargeIds: string[] = [];
  let skippedExistingCount = 0;
  const description = renderDescription(settings.descriptionTemplate, preview.period);
  const dueDate = new Date(preview.dueDate);

  for (const apt of preview.eligibleApartments) {
    try {
      const charge = await Charge.create({
        buildingId: new Types.ObjectId(input.buildingId),
        apartmentId: new Types.ObjectId(apt.apartmentId),
        type: 'monthly_due',
        title: description,
        amount: apt.amount || 0,
        currency: settings.currency,
        period: preview.period,
        dueDate,
        status: 'open',
        createdBy: new Types.ObjectId(input.actorUserId),
      });
      createdChargeIds.push(charge._id.toString());
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        skippedExistingCount += 1;
        continue;
      }
      throw error;
    }
  }

  await AutoBillingSettings.updateOne(
    { buildingId: new Types.ObjectId(input.buildingId) },
    { $set: { lastAutoBillingRunAt: new Date(), updatedBy: new Types.ObjectId(input.actorUserId) } }
  );

  return {
    ...preview,
    mode: input.mode,
    approvalRequired: false,
    createdCount: createdChargeIds.length,
    skippedExistingCount,
    createdChargeIds,
  };
}

export async function maybeRunAutoBillingForBuilding(params: {
  buildingId: string;
  actorUserId: string;
  actorName?: string;
  overrideMonth?: string;
  dryRun?: boolean;
}) {
  const building = await Building.findById(params.buildingId).select('timezone').lean();
  if (!building) {
    throw new Error('Building not found');
  }

  const settings = await getOrCreateAutoBillingSettings(params.buildingId);
  if (!settings.autoBillingEnabled) {
    return { status: 'skipped' as const, reason: 'auto_billing_disabled' };
  }

  const today = getTodayInTimezone(building.timezone || 'Asia/Jerusalem');
  const period = params.overrideMonth || getCurrentPeriodByTimezone(building.timezone || 'Asia/Jerusalem');

  if (!params.overrideMonth && today !== settings.chargeDayOfMonth) {
    return { status: 'skipped' as const, reason: 'charge_day_not_reached', period };
  }

  if (params.dryRun) {
    const preview = await buildAutoBillingPreview({
      buildingId: params.buildingId,
      period,
      mode: 'cron',
    });
    return { status: 'preview' as const, period, preview };
  }

  const runResult = await runAutoBilling({
    buildingId: params.buildingId,
    actorUserId: params.actorUserId,
    actorName: params.actorName,
    period,
    mode: 'cron',
    confirm: true,
  });
  return { status: 'executed' as const, period, runResult };
}

export async function auditAutoBillingEvent(params: {
  buildingId: string;
  actorUserId: string;
  actorName?: string;
  action:
    | 'auto_billing_settings_updated'
    | 'auto_billing_preview_generated'
    | 'auto_billing_run_started'
    | 'auto_billing_charges_generated'
    | 'auto_billing_skipped'
    | 'auto_billing_failed';
  metadata?: Record<string, unknown>;
}) {
  await createAuditLog({
    buildingId: params.buildingId,
    actorUserId: params.actorUserId,
    actorName: params.actorName,
    action: params.action,
    entityType: 'building',
    entityId: new Types.ObjectId().toString(),
    metadata: params.metadata,
  });
}
