import ExcelJS from 'exceljs';
import { Types } from 'mongoose';
import Apartment from '@/models/Apartment';
import Resident from '@/models/Resident';
import User from '@/models/User';
import { createAuditLog } from '@/lib/api-utils';
import {
  ImportError,
  ImportExecutionContext,
  ResidentsImportResult,
  ResidentsImportSummary,
  ResidentsPreviewRow,
} from './types';

function generateRandomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  const length = Math.floor(Math.random() * 3) + 10;
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export async function runResidentsImportFromWorkbook(
  workbook: ExcelJS.Workbook,
  context: ImportExecutionContext,
  options?: { knownApartmentNumbers?: string[] }
): Promise<ResidentsImportResult> {
  const residentsSheet = workbook.getWorksheet('residents');
  if (!residentsSheet) {
    throw new Error('Excel file must contain a "residents" sheet');
  }

  const existingApartments = await Apartment.find({ buildingId: context.buildingId }, null, {
    session: context.session,
  }).lean();
  const apartmentsByNumber = new Map(existingApartments.map((a) => [a.number.toLowerCase().trim(), a]));
  for (const apartmentNumber of options?.knownApartmentNumbers || []) {
    const key = apartmentNumber.toLowerCase().trim();
    if (!apartmentsByNumber.has(key)) {
      apartmentsByNumber.set(key, {
        _id: new Types.ObjectId(),
        number: apartmentNumber,
      } as any);
    }
  }

  const existingResidents = await Resident.find({ buildingId: context.buildingId }, null, {
    session: context.session,
  }).lean();
  const residentsByEmail = new Map(
    existingResidents.filter((r) => r.email).map((r) => [r.email!.toLowerCase().trim(), r])
  );

  const existingUsers = await User.find({ buildingId: context.buildingId }, null, {
    session: context.session,
  }).lean();
  const usersByResidentId = new Map(
    existingUsers.filter((u) => u.residentId).map((u) => [u.residentId!.toString(), u])
  );
  const usersByEmail = new Map(existingUsers.filter((u) => u.email).map((u) => [u.email!.toLowerCase().trim(), u]));

  const errors: ImportError[] = [];
  const preview: ResidentsPreviewRow[] = [];
  const summary: ResidentsImportSummary = {
    totalRows: 0,
    created: 0,
    skipped: 0,
    errors: 0,
    usersCreated: 0,
    usersSkipped: 0,
  };

  const headerRow = residentsSheet.getRow(1);
  const headers: Record<string, number> = {};
  headerRow.eachCell((cell, colNumber) => {
    const value = String(cell.value || '').toLowerCase().trim();
    headers[value] = colNumber;
  });

  if (!headers['apartmentnumber']) {
    throw new Error('Missing required column: apartmentNumber');
  }
  if (!headers['fullname']) {
    throw new Error('Missing required column: fullName');
  }

  interface ResidentToCreate {
    buildingId: Types.ObjectId;
    apartmentId: Types.ObjectId;
    fullName: string;
    type: string;
    email?: string;
    phone?: string;
    moveInAt: Date;
    isActive: boolean;
    createUser: boolean;
    tempPassword?: string;
  }
  const residentsToCreate: ResidentToCreate[] = [];

  for (let rowNum = 2; rowNum <= residentsSheet.rowCount; rowNum++) {
    const row = residentsSheet.getRow(rowNum);
    const apartmentNumberCell = row.getCell(headers['apartmentnumber']);
    const fullNameCell = row.getCell(headers['fullname']);
    if (!apartmentNumberCell.value && !fullNameCell.value) continue;

    summary.totalRows++;

    const apartmentNumber = String(apartmentNumberCell.value || '').trim();
    const fullName = String(fullNameCell.value || '').trim();
    const typeCell = headers['type'] ? row.getCell(headers['type']) : null;
    const emailCell = headers['email'] ? row.getCell(headers['email']) : null;
    const phoneCell = headers['phone'] ? row.getCell(headers['phone']) : null;
    const moveInAtCell = headers['moveinat'] ? row.getCell(headers['moveinat']) : null;
    const createUserCell = headers['createuser'] ? row.getCell(headers['createuser']) : null;
    const tempPasswordCell = headers['temppassword'] ? row.getCell(headers['temppassword']) : null;

    let hasError = false;
    if (!apartmentNumber) {
      errors.push({ row: rowNum, sheet: 'residents', field: 'apartmentNumber', message: 'Apartment number is required' });
      hasError = true;
    }
    if (!fullName) {
      errors.push({ row: rowNum, sheet: 'residents', field: 'fullName', message: 'Full name is required' });
      hasError = true;
    }

    const apartment = apartmentsByNumber.get(apartmentNumber.toLowerCase());
    if (!apartment && apartmentNumber) {
      errors.push({
        row: rowNum,
        sheet: 'residents',
        field: 'apartmentNumber',
        message: `Apartment "${apartmentNumber}" not found in this building`,
      });
      hasError = true;
    }

    let residentType = 'owner';
    if (typeCell?.value) {
      const typeValue = String(typeCell.value).toLowerCase().trim();
      if (typeValue && !['owner', 'tenant'].includes(typeValue)) {
        errors.push({ row: rowNum, sheet: 'residents', field: 'type', message: 'Type must be "owner" or "tenant"' });
        hasError = true;
      } else if (typeValue) {
        residentType = typeValue;
      }
    }

    let email: string | undefined;
    if (emailCell?.value) {
      email = String(emailCell.value).trim().toLowerCase();
      if (email && !isValidEmail(email)) {
        errors.push({ row: rowNum, sheet: 'residents', field: 'email', message: 'Invalid email format' });
        hasError = true;
      }
    }

    const phone = phoneCell?.value ? String(phoneCell.value).trim() : undefined;
    let moveInAt = new Date();
    if (moveInAtCell?.value) {
      const dateValue = moveInAtCell.value;
      if (dateValue instanceof Date) {
        moveInAt = dateValue;
      } else {
        const parsed = new Date(String(dateValue));
        if (!Number.isNaN(parsed.getTime())) moveInAt = parsed;
      }
    }

    const createUserValue = createUserCell?.value ? String(createUserCell.value).toLowerCase().trim() : 'no';
    const shouldCreateUser = createUserValue === 'yes' || createUserValue === 'true' || createUserValue === '1';
    let tempPassword = tempPasswordCell?.value ? String(tempPasswordCell.value).trim() : undefined;

    if (shouldCreateUser && !email) {
      errors.push({ row: rowNum, sheet: 'residents', field: 'email', message: 'Email is required when createUser=yes' });
      hasError = true;
    }

    if (hasError) {
      summary.errors++;
      preview.push({
        apartmentNumber,
        fullName,
        type: residentType,
        email: email || '',
        phone: phone || '',
        moveInAt: moveInAt.toISOString().split('T')[0],
        action: 'error',
        createUser: shouldCreateUser,
      });
      continue;
    }

    if (email) {
      const existingResident = residentsByEmail.get(email);
      if (existingResident) {
        const linkedUser = usersByResidentId.get(existingResident._id.toString());
        if (linkedUser) {
          preview.push({
            apartmentNumber,
            fullName,
            type: residentType,
            email,
            phone: phone || '',
            moveInAt: moveInAt.toISOString().split('T')[0],
            action: 'skip',
            skipReason: 'Has linked user account - use move-out/move-in flow',
            createUser: false,
          });
          summary.skipped++;
          continue;
        }

        preview.push({
          apartmentNumber,
          fullName,
          type: residentType,
          email,
          phone: phone || '',
          moveInAt: moveInAt.toISOString().split('T')[0],
          action: 'skip',
          skipReason: 'Duplicate email - resident already exists',
          createUser: false,
        });
        summary.skipped++;
        continue;
      }
    }

    let userAction: 'create' | 'skip' | undefined;
    let userSkipReason: string | undefined;
    if (shouldCreateUser && email) {
      const existingUser = usersByEmail.get(email);
      if (existingUser) {
        userAction = 'skip';
        userSkipReason = 'User already exists with this email';
        summary.usersSkipped++;
      } else {
        if (!tempPassword) tempPassword = generateRandomPassword();
        userAction = 'create';
        summary.usersCreated++;
        usersByEmail.set(email, { _id: new Types.ObjectId() } as any);
      }
    }

    residentsToCreate.push({
      buildingId: context.buildingId,
      apartmentId: apartment!._id,
      fullName,
      type: residentType,
      email: email || undefined,
      phone: phone || undefined,
      moveInAt,
      isActive: true,
      createUser: shouldCreateUser && userAction === 'create',
      tempPassword: shouldCreateUser && userAction === 'create' ? tempPassword : undefined,
    });

    preview.push({
      apartmentNumber,
      fullName,
      type: residentType,
      email: email || '',
      phone: phone || '',
      moveInAt: moveInAt.toISOString().split('T')[0],
      action: 'create',
      createUser: shouldCreateUser,
      userAction,
      userSkipReason,
    });
    summary.created++;

    if (email) residentsByEmail.set(email, { _id: new Types.ObjectId() } as any);
  }

  if (!context.dryRun) {
    for (const residentData of residentsToCreate) {
      const { createUser, tempPassword, ...residentFields } = residentData;
      const resident = await Resident.create([residentFields], { session: context.session }).then((docs) => docs[0]);

      if (createUser && tempPassword && residentFields.email) {
        const userDoc = await User.create([{
          email: residentFields.email,
          name: residentFields.fullName,
          passwordHash: tempPassword,
          role: 'RESIDENT',
          buildingId: context.buildingId,
          residentId: resident._id,
          isActive: true,
        }], { session: context.session }).then((docs) => docs[0]);

        await Resident.updateOne(
          { _id: resident._id },
          { $set: { userId: userDoc._id } },
          { session: context.session }
        );
      }
    }

    if (context.actor && (summary.created > 0 || summary.skipped > 0)) {
      await createAuditLog({
        buildingId: context.buildingId.toString(),
        actorUserId: context.actor.userId,
        actorName: context.actor.userName,
        action: 'import_residents',
        entityType: 'resident',
        entityId: new Types.ObjectId().toString(),
        metadata: {
          totalRows: summary.totalRows,
          created: summary.created,
          skipped: summary.skipped,
          errorsCount: summary.errors,
          usersCreated: summary.usersCreated,
          usersSkipped: summary.usersSkipped,
        },
      });
    }
  }

  return {
    dryRun: context.dryRun,
    summary,
    errors: errors.slice(0, 100),
    preview: preview.slice(0, 100),
  };
}

export async function runResidentsImportFromBuffer(
  fileBuffer: ArrayBuffer,
  context: ImportExecutionContext,
  options?: { knownApartmentNumbers?: string[] }
): Promise<ResidentsImportResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  return runResidentsImportFromWorkbook(workbook, context, options);
}
