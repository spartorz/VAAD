import ExcelJS from 'exceljs';
import { Types } from 'mongoose';
import Apartment from '@/models/Apartment';
import { createAuditLog } from '@/lib/api-utils';
import {
  ApartmentsImportResult,
  ImportError,
  ImportExecutionContext,
  ApartmentsPreviewRow,
  ApartmentsImportSummary,
} from './types';

export async function runApartmentsImportFromWorkbook(
  workbook: ExcelJS.Workbook,
  context: ImportExecutionContext
): Promise<ApartmentsImportResult> {
  const apartmentsSheet = workbook.getWorksheet('apartments');
  if (!apartmentsSheet) {
    throw new Error('Excel file must contain an "apartments" sheet');
  }

  const existingApartments = await Apartment.find({ buildingId: context.buildingId }, null, {
    session: context.session,
  }).lean();
  const existingByNumber = new Map(existingApartments.map((a) => [a.number.toLowerCase().trim(), a]));

  const errors: ImportError[] = [];
  const preview: ApartmentsPreviewRow[] = [];
  const summary: ApartmentsImportSummary = {
    totalRows: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  const headerRow = apartmentsSheet.getRow(1);
  const headers: Record<string, number> = {};
  headerRow.eachCell((cell, colNumber) => {
    const value = String(cell.value || '').toLowerCase().trim();
    headers[value] = colNumber;
  });

  if (!headers['apartmentnumber']) {
    throw new Error('Missing required column: apartmentNumber');
  }

  const rowCount = apartmentsSheet.rowCount;
  const apartmentsToCreate: Array<{
    buildingId: Types.ObjectId;
    number: string;
    floor?: number;
    size?: number;
    status: string;
  }> = [];
  const apartmentsToUpdate: Array<{ id: Types.ObjectId; update: Record<string, unknown> }> = [];

  for (let rowNum = 2; rowNum <= rowCount; rowNum++) {
    const row = apartmentsSheet.getRow(rowNum);
    const apartmentNumberCell = row.getCell(headers['apartmentnumber']);
    if (!apartmentNumberCell.value) continue;

    summary.totalRows++;

    const apartmentNumber = String(apartmentNumberCell.value).trim();
    const floorCell = headers['floor'] ? row.getCell(headers['floor']) : null;
    const sizeCell = headers['sizesqft'] || headers['size']
      ? row.getCell(headers['sizesqft'] || headers['size'])
      : null;
    const statusCell = headers['status'] ? row.getCell(headers['status']) : null;
    const notesCell = headers['notes'] ? row.getCell(headers['notes']) : null;

    let hasError = false;

    if (!apartmentNumber) {
      errors.push({
        row: rowNum,
        sheet: 'apartments',
        field: 'apartmentNumber',
        message: 'Apartment number is required',
      });
      hasError = true;
    }

    let floor: number | null = null;
    if (floorCell?.value !== null && floorCell?.value !== undefined && floorCell?.value !== '') {
      floor = Number(floorCell.value);
      if (Number.isNaN(floor)) {
        errors.push({ row: rowNum, sheet: 'apartments', field: 'floor', message: 'Floor must be a number' });
        hasError = true;
      }
    }

    let sizeSqft: number | null = null;
    if (sizeCell?.value !== null && sizeCell?.value !== undefined && sizeCell?.value !== '') {
      sizeSqft = Number(sizeCell.value);
      if (Number.isNaN(sizeSqft)) {
        errors.push({ row: rowNum, sheet: 'apartments', field: 'sizeSqft', message: 'Size must be a number' });
        hasError = true;
      }
    }

    let status = 'active';
    if (statusCell?.value) {
      const statusValue = String(statusCell.value).toLowerCase().trim();
      if (statusValue && !['active', 'inactive'].includes(statusValue)) {
        errors.push({
          row: rowNum,
          sheet: 'apartments',
          field: 'status',
          message: 'Status must be "active" or "inactive"',
        });
        hasError = true;
      } else if (statusValue) {
        status = statusValue;
      }
    }

    const notes = notesCell?.value ? String(notesCell.value).trim() : '';

    if (hasError) {
      summary.errors++;
      continue;
    }

    const existing = existingByNumber.get(apartmentNumber.toLowerCase());
    if (existing) {
      const updateData: Record<string, unknown> = {};
      if (floor !== null && floor !== existing.floor) updateData.floor = floor;
      if (sizeSqft !== null && sizeSqft !== existing.size) updateData.size = sizeSqft;
      if (status !== existing.status) updateData.status = status;

      if (Object.keys(updateData).length > 0) {
        apartmentsToUpdate.push({ id: existing._id, update: updateData });
        preview.push({ apartmentNumber, floor, sizeSqft, status, notes, action: 'update' });
        summary.updated++;
      } else {
        preview.push({ apartmentNumber, floor, sizeSqft, status, notes, action: 'skip' });
        summary.skipped++;
      }
    } else {
      apartmentsToCreate.push({
        buildingId: context.buildingId,
        number: apartmentNumber,
        floor: floor ?? undefined,
        size: sizeSqft ?? undefined,
        status,
      });
      preview.push({ apartmentNumber, floor, sizeSqft, status, notes, action: 'create' });
      summary.created++;
      existingByNumber.set(apartmentNumber.toLowerCase(), { _id: new Types.ObjectId(), number: apartmentNumber } as any);
    }
  }

  if (!context.dryRun) {
    if (apartmentsToCreate.length > 0) {
      await Apartment.insertMany(apartmentsToCreate, { session: context.session });
    }

    for (const { id, update } of apartmentsToUpdate) {
      await Apartment.updateOne({ _id: id }, { $set: update }, { session: context.session });
    }

    if (context.actor && (summary.created > 0 || summary.updated > 0)) {
      await createAuditLog({
        buildingId: context.buildingId.toString(),
        actorUserId: context.actor.userId,
        actorName: context.actor.userName,
        action: 'import_apartments',
        entityType: 'apartment',
        entityId: new Types.ObjectId().toString(),
        metadata: {
          totalRows: summary.totalRows,
          created: summary.created,
          updated: summary.updated,
          skipped: summary.skipped,
          errorsCount: summary.errors,
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

export async function runApartmentsImportFromBuffer(
  fileBuffer: ArrayBuffer,
  context: ImportExecutionContext
): Promise<ApartmentsImportResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  return runApartmentsImportFromWorkbook(workbook, context);
}
