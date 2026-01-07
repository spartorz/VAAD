import { NextRequest, NextResponse } from 'next/server';
import { getSession, createAuditLog } from '@/lib/api-utils';
import { canManageBuilding } from '@/lib/auth';
import Apartment from '@/models/Apartment';
import dbConnect from '@/lib/db';
import { Types } from 'mongoose';
import ExcelJS from 'exceljs';

interface ImportError {
  row: number;
  sheet: string;
  field: string;
  message: string;
}

interface PreviewRow {
  apartmentNumber: string;
  floor: number | null;
  sizeSqft: number | null;
  status: string;
  notes: string;
  action: 'create' | 'update' | 'skip';
}

interface ImportSummary {
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
}

// POST /api/import/apartments - Import apartments from Excel
export async function POST(request: NextRequest) {
  const user = await getSession();
  
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!canManageBuilding(user.role)) {
    return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get('dryRun') !== '0';

  try {
    await dbConnect();

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (!validTypes.includes(file.type) && !file.name.endsWith('.xlsx')) {
      return NextResponse.json({ success: false, error: 'Invalid file type. Please upload an Excel file (.xlsx)' }, { status: 400 });
    }

    // Read Excel file
    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    const apartmentsSheet = workbook.getWorksheet('apartments');
    if (!apartmentsSheet) {
      return NextResponse.json({ success: false, error: 'Excel file must contain an "apartments" sheet' }, { status: 400 });
    }

    const buildingId = new Types.ObjectId(user.buildingId);
    
    // Get existing apartments for this building
    const existingApartments = await Apartment.find({ buildingId }).lean();
    const existingByNumber = new Map(existingApartments.map(a => [a.number.toLowerCase().trim(), a]));

    const errors: ImportError[] = [];
    const preview: PreviewRow[] = [];
    const summary: ImportSummary = {
      totalRows: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
    };

    // Get header row to find column indices
    const headerRow = apartmentsSheet.getRow(1);
    const headers: Record<string, number> = {};
    headerRow.eachCell((cell, colNumber) => {
      const value = String(cell.value || '').toLowerCase().trim();
      headers[value] = colNumber;
    });

    // Validate required columns
    if (!headers['apartmentnumber']) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required column: apartmentNumber' 
      }, { status: 400 });
    }

    // Process data rows (skip header)
    const rowCount = apartmentsSheet.rowCount;
    const apartmentsToCreate: Array<{
      buildingId: Types.ObjectId;
      number: string;
      floor?: number;
      size?: number;
      status: string;
    }> = [];
    const apartmentsToUpdate: Array<{
      id: Types.ObjectId;
      update: Record<string, unknown>;
    }> = [];

    for (let rowNum = 2; rowNum <= rowCount; rowNum++) {
      const row = apartmentsSheet.getRow(rowNum);
      
      // Skip empty rows
      const apartmentNumberCell = row.getCell(headers['apartmentnumber']);
      if (!apartmentNumberCell.value) continue;

      summary.totalRows++;

      // Extract values
      const apartmentNumber = String(apartmentNumberCell.value).trim();
      const floorCell = headers['floor'] ? row.getCell(headers['floor']) : null;
      const sizeCell = headers['sizesqft'] || headers['size'] ? row.getCell(headers['sizesqft'] || headers['size']) : null;
      const statusCell = headers['status'] ? row.getCell(headers['status']) : null;
      const notesCell = headers['notes'] ? row.getCell(headers['notes']) : null;

      let hasError = false;

      // Validate apartment number
      if (!apartmentNumber) {
        errors.push({ row: rowNum, sheet: 'apartments', field: 'apartmentNumber', message: 'Apartment number is required' });
        hasError = true;
      }

      // Parse and validate floor
      let floor: number | null = null;
      if (floorCell?.value !== null && floorCell?.value !== undefined && floorCell?.value !== '') {
        floor = Number(floorCell.value);
        if (isNaN(floor)) {
          errors.push({ row: rowNum, sheet: 'apartments', field: 'floor', message: 'Floor must be a number' });
          hasError = true;
        }
      }

      // Parse size
      let sizeSqft: number | null = null;
      if (sizeCell?.value !== null && sizeCell?.value !== undefined && sizeCell?.value !== '') {
        sizeSqft = Number(sizeCell.value);
        if (isNaN(sizeSqft)) {
          errors.push({ row: rowNum, sheet: 'apartments', field: 'sizeSqft', message: 'Size must be a number' });
          hasError = true;
        }
      }

      // Validate status
      let status = 'active';
      if (statusCell?.value) {
        const statusValue = String(statusCell.value).toLowerCase().trim();
        if (statusValue && !['active', 'inactive'].includes(statusValue)) {
          errors.push({ row: rowNum, sheet: 'apartments', field: 'status', message: 'Status must be "active" or "inactive"' });
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

      // Check if apartment exists
      const existing = existingByNumber.get(apartmentNumber.toLowerCase());
      
      if (existing) {
        // Update existing apartment
        const updateData: Record<string, unknown> = {};
        if (floor !== null && floor !== existing.floor) updateData.floor = floor;
        if (sizeSqft !== null && sizeSqft !== existing.size) updateData.size = sizeSqft;
        if (status !== existing.status) updateData.status = status;
        // Note: notes field doesn't exist in current schema, but we track it anyway

        if (Object.keys(updateData).length > 0) {
          apartmentsToUpdate.push({ id: existing._id, update: updateData });
          preview.push({
            apartmentNumber,
            floor,
            sizeSqft,
            status,
            notes,
            action: 'update',
          });
          summary.updated++;
        } else {
          preview.push({
            apartmentNumber,
            floor,
            sizeSqft,
            status,
            notes,
            action: 'skip',
          });
          summary.skipped++;
        }
      } else {
        // Create new apartment
        apartmentsToCreate.push({
          buildingId,
          number: apartmentNumber,
          floor: floor ?? undefined,
          size: sizeSqft ?? undefined,
          status,
        });
        preview.push({
          apartmentNumber,
          floor,
          sizeSqft,
          status,
          notes,
          action: 'create',
        });
        summary.created++;
      }
    }

    // If not dry run, commit changes
    if (!dryRun) {
      // Create new apartments
      if (apartmentsToCreate.length > 0) {
        await Apartment.insertMany(apartmentsToCreate);
      }

      // Update existing apartments
      for (const { id, update } of apartmentsToUpdate) {
        await Apartment.updateOne({ _id: id }, { $set: update });
      }

      // Create audit log
      await createAuditLog({
        buildingId: user.buildingId,
        actorUserId: user.id,
        actorName: user.name,
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

    return NextResponse.json({
      success: true,
      data: {
        dryRun,
        summary,
        errors: errors.slice(0, 100), // Limit errors to first 100
        preview: preview.slice(0, 100), // Limit preview to first 100 rows
      },
    });
  } catch (error) {
    console.error('[POST /api/import/apartments] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to import apartments' 
    }, { status: 500 });
  }
}

