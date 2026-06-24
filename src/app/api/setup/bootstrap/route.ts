import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import mongoose, { ClientSession, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import Building from '@/models/Building';
import User from '@/models/User';
import AutoBillingSettings from '@/models/AutoBillingSettings';
import AuditLog from '@/models/AuditLog';
import Apartment from '@/models/Apartment';
import Resident from '@/models/Resident';
import Charge from '@/models/Charge';
import Payment from '@/models/Payment';
import MaintenanceTicket from '@/models/MaintenanceTicket';
import Vendor from '@/models/Vendor';
import DocumentModel from '@/models/Document';
import NotificationBatch from '@/models/NotificationBatch';
import NotificationItem from '@/models/NotificationItem';
import NotificationTemplate from '@/models/NotificationTemplate';
import NotificationSettings from '@/models/NotificationSettings';
import { getSystemInitializationState } from '@/lib/setup/system-init';
import { runApartmentsImportFromWorkbook } from '@/lib/import/apartments-import-service';
import { runResidentsImportFromWorkbook } from '@/lib/import/residents-import-service';
import ExcelJS from 'exceljs';

const bootstrapPayloadSchema = z.object({
  building: z.object({
    name: z.string().min(1).max(100),
    address: z.string().min(1).max(200),
    city: z.string().min(1).max(100),
    country: z.string().min(1).max(100).default('Israel'),
    timezone: z.string().default('Asia/Jerusalem'),
    currency: z.string().default('ILS'),
  }),
  admin: z.object({
    fullName: z.string().min(2).max(100),
    email: z.string().email(),
    password: z.string().min(8).max(128),
    role: z.enum(['ADMIN', 'BOARD']).default('BOARD'),
  }),
  billing: z.object({
    monthlyDueAmount: z.number().min(0),
    dueDay: z.number().int().min(1).max(28),
    invoicePrefix: z.string().trim().min(1).max(12).default('INV'),
    bankInstructions: z.string().max(500).optional(),
  }),
  importOptions: z.object({
    skipImport: z.boolean().default(true),
  }).default({ skipImport: true }),
});

const TX_UNAVAILABLE_RE = /transaction|replica set|mongos|Transaction numbers are only allowed/i;

interface CreatedRefs {
  buildingId?: Types.ObjectId;
  adminUserId?: Types.ObjectId;
  autoBillingSettingsId?: Types.ObjectId;
  auditLogIds: Types.ObjectId[];
}

async function parseRequest(request: NextRequest) {
  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1';

  const formData = await request.formData();
  const payloadRaw = formData.get('payload');
  if (!payloadRaw || typeof payloadRaw !== 'string') {
    return { error: 'Missing payload' } as const;
  }

  let payloadJson: unknown;
  try {
    payloadJson = JSON.parse(payloadRaw);
  } catch {
    return { error: 'Invalid payload JSON' } as const;
  }

  const parsed = bootstrapPayloadSchema.safeParse(payloadJson);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message || 'Invalid payload' } as const;
  }

  const file = formData.get('file');
  if (file && !(file instanceof File)) {
    return { error: 'Invalid file payload' } as const;
  }
  if (file && !file.name.toLowerCase().endsWith('.xlsx')) {
    return { error: 'Invalid file type. Please upload an Excel file (.xlsx)' } as const;
  }

  return {
    dryRun,
    payload: parsed.data,
    file: file instanceof File ? file : null,
  } as const;
}

async function runImportPreview(file: File | null) {
  if (!file) return null;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const tempBuildingId = new Types.ObjectId();
  const apartmentsResult = await runApartmentsImportFromWorkbook(workbook, {
    buildingId: tempBuildingId,
    dryRun: true,
  });
  const residentsResult = await runResidentsImportFromWorkbook(
    workbook,
    {
      buildingId: tempBuildingId,
      dryRun: true,
    },
    { knownApartmentNumbers: apartmentsResult.preview.map((row) => row.apartmentNumber) }
  );

  return { apartments: apartmentsResult, residents: residentsResult };
}

async function rollbackCreatedData(refs: CreatedRefs) {
  if (refs.buildingId) {
    const filter = { buildingId: refs.buildingId };
    await Promise.all([
      Apartment.deleteMany(filter),
      Resident.deleteMany(filter),
      User.deleteMany(filter),
      Charge.deleteMany(filter),
      Payment.deleteMany(filter),
      MaintenanceTicket.deleteMany(filter),
      Vendor.deleteMany(filter),
      DocumentModel.deleteMany(filter),
      AutoBillingSettings.deleteMany(filter),
      NotificationBatch.deleteMany(filter),
      NotificationItem.deleteMany(filter),
      NotificationTemplate.deleteMany(filter),
      NotificationSettings.deleteMany(filter),
      AuditLog.deleteMany(filter),
    ]);
  }

  if (refs.auditLogIds.length > 0) {
    await AuditLog.deleteMany({ _id: { $in: refs.auditLogIds } });
  }
  if (refs.autoBillingSettingsId) {
    await AutoBillingSettings.deleteOne({ _id: refs.autoBillingSettingsId });
  }
  if (refs.adminUserId) {
    await User.deleteOne({ _id: refs.adminUserId });
  }
  if (refs.buildingId) {
    await Building.deleteOne({ _id: refs.buildingId });
  }
}

async function createBootstrapData(
  payload: z.infer<typeof bootstrapPayloadSchema>,
  file: File | null,
  dryRun: boolean,
  refs: CreatedRefs,
  session?: ClientSession
) {
  const [buildingCount, privilegedUsers] = await Promise.all([
    Building.countDocuments({}, { session }),
    User.countDocuments({ role: { $in: ['ADMIN', 'BOARD'] } }, { session }),
  ]);
  if (buildingCount > 0 || privilegedUsers > 0) {
    throw new Error('System already initialized');
  }

  if (!payload.importOptions.skipImport && !file) {
    throw new Error('Excel file is required when import is enabled');
  }

  const importPreview = await runImportPreview(file);
  if (dryRun) {
    return {
      dryRun: true,
      importPreview,
    };
  }

  const building = await Building.create([{
    name: payload.building.name,
    address: payload.building.address,
    city: payload.building.city,
    country: payload.building.country,
    timezone: payload.building.timezone,
    bankInfo: payload.billing.bankInstructions
      ? { notes: payload.billing.bankInstructions }
      : undefined,
    settings: {
      currency: payload.building.currency,
      dueDay: payload.billing.dueDay,
      monthlyDueAmount: payload.billing.monthlyDueAmount,
      invoicePrefix: payload.billing.invoicePrefix,
    },
  }], { session }).then((docs) => docs[0]);
  refs.buildingId = building._id;

  const adminUser = await User.create([{
    buildingId: building._id,
    name: payload.admin.fullName,
    email: payload.admin.email.toLowerCase(),
    passwordHash: payload.admin.password,
    role: payload.admin.role,
    isActive: true,
  }], { session }).then((docs) => docs[0]);
  refs.adminUserId = adminUser._id;

  const autoBillingSettings = await AutoBillingSettings.create([{
    buildingId: building._id,
    autoBillingEnabled: false,
    monthlyAmount: payload.billing.monthlyDueAmount,
    currency: payload.building.currency,
    chargeDayOfMonth: 1,
    dueDayOfMonth: payload.billing.dueDay,
    descriptionTemplate: 'דמי ועד בית עבור {period}',
    requireApprovalBeforeGeneration: true,
    activeApartmentStatuses: ['active'],
    updatedBy: adminUser._id,
  }], { session }).then((docs) => docs[0]);
  refs.autoBillingSettingsId = autoBillingSettings._id;

  let importResult: Awaited<ReturnType<typeof runImportPreview>> = null;
  if (!payload.importOptions.skipImport && file) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());

    const apartments = await runApartmentsImportFromWorkbook(workbook, {
      buildingId: building._id,
      dryRun: false,
      session,
    });
    const residents = await runResidentsImportFromWorkbook(
      workbook,
      {
        buildingId: building._id,
        dryRun: false,
        session,
      },
      { knownApartmentNumbers: apartments.preview.map((row) => row.apartmentNumber) }
    );
    importResult = { apartments, residents };
  }

  const bootstrapAudit = await AuditLog.create([{
    buildingId: building._id,
    actorUserId: adminUser._id,
    actorName: adminUser.name,
    action: 'create',
    entityType: 'building',
    entityId: building._id,
    metadata: {
      source: 'setup_bootstrap',
      firstAdminRole: adminUser.role,
      importSkipped: payload.importOptions.skipImport || !file,
      importedApartments: importResult?.apartments.summary.created || 0,
      importedResidents: importResult?.residents.summary.created || 0,
    },
  }], { session }).then((docs) => docs[0]);
  refs.auditLogIds.push(bootstrapAudit._id);

  return {
    dryRun: false,
    buildingId: building._id.toString(),
    adminUserId: adminUser._id.toString(),
    importResult,
  };
}

async function executeBootstrap(
  payload: z.infer<typeof bootstrapPayloadSchema>,
  file: File | null,
  dryRun: boolean
) {
  const refs: CreatedRefs = { auditLogIds: [] };
  let session: ClientSession | null = null;

  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const result = await createBootstrapData(payload, file, dryRun, refs, session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    if (session) {
      try {
        await session.abortTransaction();
      } catch {
        // noop
      }
    }

    if (!TX_UNAVAILABLE_RE.test(error instanceof Error ? error.message : String(error))) {
      throw error;
    }

    const fallbackRefs: CreatedRefs = { auditLogIds: [] };
    try {
      return await createBootstrapData(payload, file, dryRun, fallbackRefs);
    } catch (fallbackError) {
      await rollbackCreatedData(fallbackRefs);
      throw fallbackError;
    }
  } finally {
    if (session) {
      await session.endSession();
    }
  }
}

export async function POST(request: NextRequest) {
  await dbConnect();

  const initializationState = await getSystemInitializationState();
  if (initializationState.isInitialized) {
    return NextResponse.json(
      { success: false, error: 'System already initialized' },
      { status: 409 }
    );
  }

  try {
    const parsed = await parseRequest(request);
    if ('error' in parsed) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }

    const result = await executeBootstrap(parsed.payload, parsed.file, parsed.dryRun);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('[POST /api/setup/bootstrap] Error:', error);
    if (error instanceof Error && error.message === 'System already initialized') {
      return NextResponse.json(
        { success: false, error: 'System already initialized' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Bootstrap failed' },
      { status: 500 }
    );
  }
}
