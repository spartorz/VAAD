/**
 * Notification batch service.
 *
 * Responsible for:
 * - Idempotent batch generation for a given building × type × month × channel
 * - Creating NotificationItem records per recipient (with cooldown + skip logic)
 * - Recomputing batch stats from items
 * - Loading building notification settings (with safe defaults)
 *
 * Billing status logic mirrors GET /api/billing/monthly (canonical source).
 * Both must stay in sync if the formula ever changes.
 */

import { Types } from 'mongoose';
import dbConnect from '@/lib/db';
import NotificationBatch, { INotificationBatch } from '@/models/NotificationBatch';
import NotificationItem from '@/models/NotificationItem';
import NotificationSettings, { INotificationSettings } from '@/models/NotificationSettings';
import NotificationTemplate from '@/models/NotificationTemplate';
import Apartment from '@/models/Apartment';
import Resident from '@/models/Resident';
import Charge from '@/models/Charge';
import Payment from '@/models/Payment';
import {
  NotificationChannel,
  NotificationType,
  NotificationItemStatus,
  NotificationBatchStatus,
  NotificationSkipReason,
} from '@/lib/types';
import {
  renderPaymentReminder,
  TEMPLATE_PAYMENT_REMINDER_WHATSAPP_HE_V1,
} from './message-renderer';
import {
  renderTemplateBody,
  buildSampleContext,
  TemplateRenderContext,
} from './template-renderer';

// ─── Types ────────────────────────────────────────────────────────────────

export interface GenerateBatchParams {
  buildingId: string;
  buildingName: string;
  month: string;
  createdBy: string;
  channel?: NotificationChannel;
  /** Use a specific DB template */
  templateId?: string;
  /** Override the template body with custom free text */
  customMessage?: string;
  /**
   * Explicit apartment IDs to include. If provided, only these apartments are
   * targeted; all other eligible apartments become manually_excluded skipped items.
   * Cooldown / phone checks still apply unless bypassCooldown is set.
   */
  includeApartmentIds?: string[];
  /**
   * Explicit apartment IDs to exclude from an otherwise eligible audience.
   * These become manually_excluded cancelled items.
   */
  excludeApartmentIds?: string[];
  /**
   * When true, the cooldown check is skipped for the targeted apartments.
   * No-phone check is unaffected — a valid phone is always required.
   */
  bypassCooldown?: boolean;
  /** Cancel any existing non-cancelled batch for this key before creating */
  force?: boolean;
}

export interface GenerateBatchResult {
  batch: INotificationBatch;
  /** true = newly created, false = returned existing */
  created: boolean;
  itemCount: number;
  skippedCount: number;
}

interface ApartmentRow {
  apartmentId: string;
  apartmentNumber: string;
  floor?: number;
  residentId?: string;
  residentName: string;
  residentType?: 'owner' | 'tenant';
  phone?: string;
  chargeId?: string;
  amount: number;
  billingStatus: 'unpaid' | 'partial';
}

// ─── Public candidate type (used by the candidates API) ───────────────────

export interface NotificationCandidateRow {
  apartmentId: string;
  apartmentNumber: string;
  floor?: number;
  residentId?: string;
  residentName: string;
  hasValidPhone: boolean;
  phone?: string;
  normalizedPhone?: string;
  residentType?: 'owner' | 'tenant';
  billingStatus: 'unpaid' | 'partial';
  balanceAmount: number;
  chargeId?: string;
  cooldownStatus: 'clear' | 'recently_contacted';
  lastContactAt?: Date;
  daysSinceContact?: number;
}

interface SkippedRow {
  apartmentId: string;
  apartmentNumber: string;
  skipReason: NotificationSkipReason;
  recentContactAt?: Date;
  renderedMessage: string;
}

// ─── Settings helpers ─────────────────────────────────────────────────────

const SETTINGS_DEFAULTS: Omit<INotificationSettings, '_id' | 'buildingId' | 'createdAt' | 'updatedAt'> = {
  paymentRemindersEnabled: true,
  reminderMode: 'manual_only',
  reminderDayOfMonth: 5,
  gracePeriodDays: 5,
  cooldownDays: 14,
  requireApprovalBeforeSending: false,
  skipRecentlyContactedResidents: true,
  activeChannels: ['whatsapp_manual'],
};

/**
 * Load notification settings for a building, upsert with safe defaults if missing.
 */
export async function getOrCreateSettings(buildingId: string): Promise<INotificationSettings> {
  await dbConnect();
  const existing = await NotificationSettings.findOne({
    buildingId: new Types.ObjectId(buildingId),
  });
  if (existing) return existing;

  return NotificationSettings.create({
    buildingId: new Types.ObjectId(buildingId),
    ...SETTINGS_DEFAULTS,
  });
}

/**
 * Fetch the enriched candidate list for a building × month.
 *
 * Returns all unpaid/partial apartments enriched with cooldown status and
 * phone validity. Used by the /api/notifications/candidates endpoint so the
 * UI can render a targeting table before batch generation.
 */
export async function fetchNotificationCandidates(
  buildingId: string,
  month: string
): Promise<NotificationCandidateRow[]> {
  await dbConnect();
  const settings = await getOrCreateSettings(buildingId);
  const rows = await fetchUnpaidApartments(buildingId, month);
  const buildingOid = new Types.ObjectId(buildingId);

  const candidates: NotificationCandidateRow[] = [];

  for (const row of rows) {
    const normalized = normalizePhone(row.phone);
    const hasValidPhone = !!normalized;

    let cooldownStatus: 'clear' | 'recently_contacted' = 'clear';
    let lastContactAt: Date | undefined;
    let daysSinceContact: number | undefined;

    if (settings.skipRecentlyContactedResidents) {
      const recentContact = await checkCooldown(
        buildingOid,
        new Types.ObjectId(row.apartmentId),
        settings.cooldownDays
      );
      if (recentContact) {
        cooldownStatus = 'recently_contacted';
        lastContactAt = recentContact;
        daysSinceContact = Math.floor(
          (Date.now() - recentContact.getTime()) / (1000 * 60 * 60 * 24)
        );
      }
    }

    candidates.push({
      apartmentId: row.apartmentId,
      apartmentNumber: row.apartmentNumber,
      floor: row.floor,
      residentId: row.residentId,
      residentName: row.residentName,
      hasValidPhone,
      phone: row.phone,
      normalizedPhone: normalized ?? undefined,
      residentType: row.residentType,
      billingStatus: row.billingStatus,
      balanceAmount: row.amount,
      chargeId: row.chargeId,
      cooldownStatus,
      lastContactAt,
      daysSinceContact,
    });
  }

  return candidates;
}

// ─── Phone normalisation (server-side mirror of the page utility) ─────────

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let n = phone.replace(/[\s\-\(\)]/g, '');
  if (!n.startsWith('+') && !n.startsWith('972')) {
    if (n.startsWith('0')) n = '972' + n.slice(1);
    else return null;
  }
  if (n.startsWith('+')) n = n.slice(1);
  return /^\d{10,15}$/.test(n) ? n : null;
}

// ─── Cooldown check ───────────────────────────────────────────────────────

/**
 * Returns the most recent contact date for an apartment if it falls within
 * cooldownDays, or null if the apartment is safe to contact.
 */
async function checkCooldown(
  buildingId: Types.ObjectId,
  apartmentId: Types.ObjectId,
  cooldownDays: number
): Promise<Date | null> {
  const cutoff = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000);
  const item = await NotificationItem.findOne({
    buildingId,
    apartmentId,
    status: { $in: ['opened_manual', 'sent', 'delivered', 'read'] as NotificationItemStatus[] },
    lastAttemptAt: { $gte: cutoff },
  })
    .sort({ lastAttemptAt: -1 })
    .select('lastAttemptAt')
    .lean();
  return item?.lastAttemptAt ?? null;
}

// ─── Internal billing query ───────────────────────────────────────────────

async function fetchUnpaidApartments(
  buildingId: string,
  month: string
): Promise<ApartmentRow[]> {
  const buildingOid = new Types.ObjectId(buildingId);
  const [year, monthNum] = month.split('-').map(Number);
  const periodStart = new Date(year, monthNum - 1, 1);
  const periodEnd = new Date(year, monthNum, 1);

  const charges = await Charge.find({
    buildingId: buildingOid,
    type: 'monthly_due',
    status: 'open',
    period: month,
  }).lean();

  if (charges.length === 0) return [];

  const apartmentIds = charges.map((c) => c.apartmentId);

  const payments = await Payment.find({
    buildingId: buildingOid,
    status: 'confirmed',
    paidAt: { $gte: periodStart, $lt: periodEnd },
    apartmentId: { $in: apartmentIds },
  }).lean();

  const paidMap = new Map<string, number>();
  for (const p of payments) {
    const key = p.apartmentId.toString();
    paidMap.set(key, (paidMap.get(key) ?? 0) + p.amount);
  }

  const residents = await Resident.find({
    buildingId: buildingOid,
    apartmentId: { $in: apartmentIds },
    isActive: true,
  }).lean();

  const residentMap = new Map<string, (typeof residents)[number]>();
  for (const r of residents) {
    const key = r.apartmentId.toString();
    if (!residentMap.has(key) || r.type === 'owner') {
      residentMap.set(key, r);
    }
  }

  const apartments = await Apartment.find({ _id: { $in: apartmentIds } }).lean();
  const apartmentMap = new Map(apartments.map((a) => [a._id.toString(), a]));

  const rows: ApartmentRow[] = [];
  for (const charge of charges) {
    const aptKey = charge.apartmentId.toString();
    const apt = apartmentMap.get(aptKey);
    if (!apt) continue;

    const paidThisMonth = paidMap.get(aptKey) ?? 0;
    const remaining = Math.max(0, charge.amount - paidThisMonth);
    if (remaining <= 0) continue;

    const billingStatus: 'unpaid' | 'partial' = paidThisMonth > 0 ? 'partial' : 'unpaid';
    const resident = residentMap.get(aptKey);

    rows.push({
      apartmentId: aptKey,
      apartmentNumber: apt.number,
      floor: (apt as { floor?: number }).floor,
      residentId: resident?._id.toString(),
      residentName: resident?.fullName ?? 'דייר/ת',
      residentType: resident?.type as 'owner' | 'tenant' | undefined,
      phone: resident?.phone,
      chargeId: charge._id.toString(),
      amount: remaining,
      billingStatus,
    });
  }

  return rows;
}

// ─── Message body resolver ────────────────────────────────────────────────

async function resolveMessageBody(params: {
  buildingId: string;
  type: NotificationType;
  channel: NotificationChannel;
  templateId?: string;
  customMessage?: string;
}): Promise<{ body: string; templateId?: string; isCustom: boolean }> {
  // 1. Custom free-text override takes highest priority
  if (params.customMessage?.trim()) {
    return { body: params.customMessage.trim(), isCustom: true };
  }

  // 2. Specific template requested
  if (params.templateId) {
    const tpl = await NotificationTemplate.findOne({
      _id: new Types.ObjectId(params.templateId),
      buildingId: new Types.ObjectId(params.buildingId),
      isActive: true,
    }).lean();
    if (tpl) return { body: tpl.body, templateId: tpl._id.toString(), isCustom: false };
  }

  // 3. Default active template for this building/type/channel
  const defaultTpl = await NotificationTemplate.findOne({
    buildingId: new Types.ObjectId(params.buildingId),
    type: params.type,
    channel: params.channel,
    isDefault: true,
    isActive: true,
  }).lean();
  if (defaultTpl) {
    return { body: defaultTpl.body, templateId: defaultTpl._id.toString(), isCustom: false };
  }

  // 4. Fallback: use the hardcoded renderer (Phase 2 behavior, no template in DB)
  return { body: '', isCustom: false };
}

function buildRenderContext(
  row: ApartmentRow,
  buildingName: string,
  month: string,
  baseUrl: string
): TemplateRenderContext {
  const [year, monthNum] = month.split('-').map(Number);
  const monthLabel = new Date(year, monthNum - 1, 1).toLocaleDateString('he-IL', {
    year: 'numeric',
    month: 'long',
  });
  const reference = `VAAD-${row.apartmentNumber}-${month}`;
  const invoiceUrl = row.chargeId
    ? `${baseUrl}/billing/invoice/${row.chargeId}`
    : `${baseUrl}/billing`;

  return {
    residentName: row.residentName,
    apartmentNumber: row.apartmentNumber,
    monthLabel,
    balanceAmount: row.amount.toLocaleString('he-IL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    buildingName,
    reference,
    invoiceUrl,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Idempotently generate a payment-reminder batch for the given building/month.
 *
 * Respects notification settings: cooldown, skip logic, approval requirement.
 * Falls back to Phase 2 behavior if no settings or templates exist.
 */
export async function generatePaymentReminderBatch(
  params: GenerateBatchParams
): Promise<GenerateBatchResult> {
  await dbConnect();

  const {
    buildingId,
    buildingName,
    month,
    createdBy,
    channel = 'whatsapp_manual',
    templateId,
    customMessage,
    includeApartmentIds,
    excludeApartmentIds,
    bypassCooldown = false,
    force = false,
  } = params;

  const buildingOid = new Types.ObjectId(buildingId);
  const type: NotificationType = 'payment_reminder';

  // ── Idempotency check ──
  const existingBatch = await NotificationBatch.findOne({
    buildingId: buildingOid,
    type,
    month,
    channel,
    status: { $nin: ['cancelled'] as NotificationBatchStatus[] },
  });

  if (existingBatch && !force) {
    const itemCount = await NotificationItem.countDocuments({
      batchId: existingBatch._id,
      status: { $ne: 'cancelled' as NotificationItemStatus },
    });
    return { batch: existingBatch, created: false, itemCount, skippedCount: existingBatch.skippedCount };
  }

  if (existingBatch && force) {
    existingBatch.status = 'cancelled';
    await existingBatch.save();
    await NotificationItem.updateMany(
      { batchId: existingBatch._id },
      { $set: { status: 'cancelled' as NotificationItemStatus } }
    );
  }

  // ── Load settings ──
  const settings = await getOrCreateSettings(buildingId);

  // ── Resolve message body ──
  const msgResult = await resolveMessageBody({
    buildingId,
    type,
    channel,
    templateId,
    customMessage,
  });

  // ── Fetch recipients ──
  const allRows = await fetchUnpaidApartments(buildingId, month);
  const baseUrl = process.env.APP_BASE_URL ?? '';

  // ── Apply explicit targeting (include / exclude) ──
  const includeSet = includeApartmentIds?.length
    ? new Set(includeApartmentIds)
    : null;
  const excludeSet = excludeApartmentIds?.length
    ? new Set(excludeApartmentIds)
    : null;

  const manuallyExcludedRows: ApartmentRow[] = [];
  let rows = allRows;

  if (includeSet) {
    // Only target explicitly selected apartments; mark others as manually_excluded
    manuallyExcludedRows.push(...allRows.filter((r) => !includeSet.has(r.apartmentId)));
    rows = allRows.filter((r) => includeSet.has(r.apartmentId));
  }

  if (excludeSet) {
    const toExclude = rows.filter((r) => excludeSet.has(r.apartmentId));
    manuallyExcludedRows.push(...toExclude);
    rows = rows.filter((r) => !excludeSet.has(r.apartmentId));
  }

  const isManualTargeting = !!(includeSet || excludeSet);

  // ── Partition targeted rows into active vs skipped ──
  const activeItems: Array<{
    row: ApartmentRow;
    phone: string;
    renderedMessage: string;
    renderContext: TemplateRenderContext;
  }> = [];
  const skippedItems: SkippedRow[] = [];

  const cooldownEnabled = !bypassCooldown && settings.skipRecentlyContactedResidents;

  for (const row of rows) {
    const normalizedPhone = normalizePhone(row.phone);

    // Skip: no valid phone (hard requirement, not bypassed)
    if (!normalizedPhone) {
      const ctx = buildRenderContext(row, buildingName, month, baseUrl);
      skippedItems.push({
        apartmentId: row.apartmentId,
        apartmentNumber: row.apartmentNumber,
        skipReason: 'no_phone',
        renderedMessage: msgResult.body
          ? renderTemplateBody(msgResult.body, ctx)
          : renderPaymentReminder({
              residentName: ctx.residentName,
              buildingName,
              period: month,
              amount: row.amount,
              apartmentNumber: row.apartmentNumber,
              chargeId: row.chargeId,
              baseUrl,
            }),
      });
      continue;
    }

    // Skip: cooldown (only when not bypassed)
    if (cooldownEnabled) {
      const recentContactAt = await checkCooldown(
        buildingOid,
        new Types.ObjectId(row.apartmentId),
        settings.cooldownDays
      );
      if (recentContactAt) {
        const ctx = buildRenderContext(row, buildingName, month, baseUrl);
        skippedItems.push({
          apartmentId: row.apartmentId,
          apartmentNumber: row.apartmentNumber,
          skipReason: 'recently_contacted',
          recentContactAt,
          renderedMessage: msgResult.body
            ? renderTemplateBody(msgResult.body, ctx)
            : renderPaymentReminder({
                residentName: ctx.residentName,
                buildingName,
                period: month,
                amount: row.amount,
                apartmentNumber: row.apartmentNumber,
                chargeId: row.chargeId,
                baseUrl,
              }),
        });
        continue;
      }
    }

    // Active recipient
    const ctx = buildRenderContext(row, buildingName, month, baseUrl);
    const renderedMessage = msgResult.body
      ? renderTemplateBody(msgResult.body, ctx)
      : renderPaymentReminder({
          residentName: ctx.residentName,
          buildingName,
          period: month,
          amount: row.amount,
          apartmentNumber: row.apartmentNumber,
          chargeId: row.chargeId,
          baseUrl,
        });

    activeItems.push({ row, phone: normalizedPhone, renderedMessage, renderContext: ctx });
  }

  const unpaidCount = allRows.filter((r) => r.billingStatus === 'unpaid').length;
  const partialCount = allRows.filter((r) => r.billingStatus === 'partial').length;
  const noPhoneCount = skippedItems.filter((s) => s.skipReason === 'no_phone').length;
  const recentlyContactedCount = skippedItems.filter(
    (s) => s.skipReason === 'recently_contacted'
  ).length;
  const manuallyExcludedCount = manuallyExcludedRows.length;

  const [year, monthNum] = month.split('-').map(Number);
  const periodDisplay = new Date(year, monthNum - 1, 1).toLocaleDateString('he-IL', {
    year: 'numeric',
    month: 'long',
  });

  // ── Determine initial batch status ──
  const initialStatus: NotificationBatchStatus = settings.requireApprovalBeforeSending
    ? 'ready_for_review'
    : 'ready';

  const totalSkipped = skippedItems.length + manuallyExcludedCount;

  // ── Create batch ──
  const batch = await NotificationBatch.create({
    buildingId: buildingOid,
    type,
    month,
    title: `תזכורת תשלום — ${periodDisplay}`,
    messageTemplate: msgResult.templateId
      ? `db:${msgResult.templateId}`
      : TEMPLATE_PAYMENT_REMINDER_WHATSAPP_HE_V1,
    ...(msgResult.templateId ? { templateId: new Types.ObjectId(msgResult.templateId) } : {}),
    ...(msgResult.isCustom ? { customMessage: customMessage ?? msgResult.body } : {}),
    isCustomMessage: msgResult.isCustom,
    channel,
    audienceSummary: {
      total: allRows.length,
      unpaid: unpaidCount,
      partial: partialCount,
    },
    createdBy: new Types.ObjectId(createdBy),
    status: initialStatus,
    stats: {
      total: activeItems.length,
      pending: activeItems.length,
      openedManual: 0,
      retrying: 0,
      sent: 0,
      failed: 0,
      cancelled: totalSkipped,
    },
    skippedCount: totalSkipped,
    skippedSummary: {
      noPhone: noPhoneCount,
      recentlyContacted: recentlyContactedCount,
      manuallyExcluded: manuallyExcludedCount,
      total: totalSkipped,
    },
    targetingMode: isManualTargeting ? 'manual' : 'automatic',
  });

  // ── Create active items ──
  if (activeItems.length > 0) {
    const activeDocs = activeItems.map(({ row, phone, renderedMessage, renderContext }) => ({
      buildingId: buildingOid,
      batchId: batch._id,
      ...(row.residentId ? { residentId: new Types.ObjectId(row.residentId) } : {}),
      apartmentId: new Types.ObjectId(row.apartmentId),
      phone,
      channel,
      type,
      renderedMessage,
      status: 'pending' as NotificationItemStatus,
      retryCount: 0,
      maxRetries: 3,
      metadata: {
        apartmentNumber: row.apartmentNumber,
        amount: row.amount,
        chargeId: row.chargeId,
        billingStatus: row.billingStatus,
        // Stored for WhatsApp API template parameter building at send time
        renderContext,
      },
    }));
    await NotificationItem.insertMany(activeDocs, { ordered: false });
  }

  // ── Create auto-skipped items (status: cancelled) ──
  if (skippedItems.length > 0) {
    const skippedDocs = skippedItems.map((s) => ({
      buildingId: buildingOid,
      batchId: batch._id,
      apartmentId: new Types.ObjectId(s.apartmentId),
      channel,
      type,
      renderedMessage: s.renderedMessage,
      status: 'cancelled' as NotificationItemStatus,
      skipReason: s.skipReason,
      ...(s.recentContactAt ? { recentContactAt: s.recentContactAt } : {}),
      retryCount: 0,
      maxRetries: 3,
      metadata: { apartmentNumber: s.apartmentNumber, skipReason: s.skipReason },
    }));
    await NotificationItem.insertMany(skippedDocs, { ordered: false });
  }

  // ── Create manually-excluded items (status: cancelled, skipReason: manually_excluded) ──
  if (manuallyExcludedRows.length > 0) {
    const excludedDocs = manuallyExcludedRows.map((row) => ({
      buildingId: buildingOid,
      batchId: batch._id,
      ...(row.residentId ? { residentId: new Types.ObjectId(row.residentId) } : {}),
      apartmentId: new Types.ObjectId(row.apartmentId),
      channel,
      type,
      renderedMessage: '',
      status: 'cancelled' as NotificationItemStatus,
      skipReason: 'manually_excluded' as NotificationSkipReason,
      retryCount: 0,
      maxRetries: 3,
      metadata: { apartmentNumber: row.apartmentNumber, skipReason: 'manually_excluded' },
    }));
    await NotificationItem.insertMany(excludedDocs, { ordered: false });
  }

  return {
    batch,
    created: true,
    itemCount: activeItems.length,
    skippedCount: totalSkipped,
  };
}

/**
 * Recompute and persist batch stats from its items.
 * Call after any status change on items.
 */
export async function refreshBatchStats(batchId: string): Promise<void> {
  await dbConnect();
  const oid = new Types.ObjectId(batchId);

  const counts = await NotificationItem.aggregate<{
    _id: NotificationItemStatus;
    count: number;
  }>([
    { $match: { batchId: oid } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const statsMap: Record<string, number> = {};
  for (const c of counts) statsMap[c._id] = c.count;

  const total = Object.values(statsMap).reduce((s, n) => s + n, 0);

  await NotificationBatch.updateOne(
    { _id: oid },
    {
      $set: {
        'stats.total': total,
        'stats.pending': (statsMap['pending'] ?? 0) + (statsMap['draft'] ?? 0),
        'stats.openedManual': statsMap['opened_manual'] ?? 0,
        'stats.retrying': statsMap['retrying'] ?? 0,
        'stats.sent': statsMap['sent'] ?? 0,
        'stats.delivered': statsMap['delivered'] ?? 0,
        'stats.read': statsMap['read'] ?? 0,
        'stats.failed': statsMap['failed'] ?? 0,
        'stats.cancelled': statsMap['cancelled'] ?? 0,
      },
    }
  );
}

/**
 * Render a preview message for a specific apartment row (or a sample context).
 * Used by the preview API endpoint.
 */
export async function renderPreviewMessage(params: {
  buildingId: string;
  buildingName: string;
  month: string;
  templateId?: string;
  customMessage?: string;
  /** If provided, use real resident data for this apartment */
  sampleApartmentId?: string;
}): Promise<string> {
  await dbConnect();

  const { buildingId, buildingName, month, sampleApartmentId } = params;
  const baseUrl = process.env.APP_BASE_URL ?? '';

  const msgResult = await resolveMessageBody({
    buildingId,
    type: 'payment_reminder',
    channel: 'whatsapp_manual',
    templateId: params.templateId,
    customMessage: params.customMessage,
  });

  let ctx: TemplateRenderContext;

  if (sampleApartmentId && Types.ObjectId.isValid(sampleApartmentId)) {
    // Use real data
    const [year, monthNum] = month.split('-').map(Number);
    const periodStart = new Date(year, monthNum - 1, 1);
    const periodEnd = new Date(year, monthNum, 1);
    const buildingOid = new Types.ObjectId(buildingId);
    const aptOid = new Types.ObjectId(sampleApartmentId);

    const apt = await Apartment.findById(aptOid).lean();
    const resident = await Resident.findOne({
      buildingId: buildingOid,
      apartmentId: aptOid,
      isActive: true,
    }).lean();
    const charge = await Charge.findOne({
      buildingId: buildingOid,
      apartmentId: aptOid,
      type: 'monthly_due',
      status: 'open',
      period: month,
    }).lean();
    const payments = await Payment.find({
      buildingId: buildingOid,
      apartmentId: aptOid,
      status: 'confirmed',
      paidAt: { $gte: periodStart, $lt: periodEnd },
    }).lean();
    const paid = payments.reduce((s, p) => s + p.amount, 0);
    const remaining = Math.max(0, (charge?.amount ?? 0) - paid);

    if (apt) {
      ctx = buildRenderContext(
        {
          apartmentId: sampleApartmentId,
          apartmentNumber: apt.number,
          residentId: resident?._id.toString(),
          residentName: resident?.fullName ?? 'דייר/ת',
          phone: resident?.phone,
          chargeId: charge?._id.toString(),
          amount: remaining,
          billingStatus: 'unpaid',
        },
        buildingName,
        month,
        baseUrl
      );
    } else {
      ctx = buildSampleContext(buildingName, month);
    }
  } else {
    ctx = buildSampleContext(buildingName, month);
  }

  if (msgResult.body) {
    const { renderTemplateBody: render } = await import('./template-renderer');
    return render(msgResult.body, ctx);
  }

  // Fallback to hardcoded renderer
  return renderPaymentReminder({
    residentName: ctx.residentName,
    buildingName,
    period: month,
    amount: parseFloat(ctx.balanceAmount.replace(/[^\d.]/g, '')),
    apartmentNumber: ctx.apartmentNumber,
    chargeId: undefined,
    baseUrl,
  });
}
