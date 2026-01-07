import { NextResponse } from 'next/server';
import { getSession } from '@/lib/api-utils';
import { canManageBuilding } from '@/lib/auth';
import ExcelJS from 'exceljs';

// GET /api/import/templates/apartments - Download apartments import template
export async function GET() {
  const user = await getSession();
  
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!canManageBuilding(user.role)) {
    return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 });
  }

  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'VAAD Management System';
    workbook.created = new Date();

    // Create apartments sheet
    const apartmentsSheet = workbook.addWorksheet('apartments', {
      properties: { tabColor: { argb: '4472C4' } },
    });

    // Define columns with headers
    apartmentsSheet.columns = [
      { header: 'apartmentNumber', key: 'apartmentNumber', width: 18 },
      { header: 'floor', key: 'floor', width: 10 },
      { header: 'sizeSqft', key: 'sizeSqft', width: 12 },
      { header: 'status', key: 'status', width: 12 },
      { header: 'notes', key: 'notes', width: 30 },
    ];

    // Style header row
    const headerRow = apartmentsSheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '4472C4' },
    };
    headerRow.alignment = { horizontal: 'center' };

    // Add example rows
    apartmentsSheet.addRow({
      apartmentNumber: '101',
      floor: 1,
      sizeSqft: 85,
      status: 'active',
      notes: 'Example apartment',
    });
    apartmentsSheet.addRow({
      apartmentNumber: '102',
      floor: 1,
      sizeSqft: 90,
      status: 'active',
      notes: '',
    });

    // Add instructions sheet
    const instructionsSheet = workbook.addWorksheet('Instructions', {
      properties: { tabColor: { argb: '70AD47' } },
    });

    instructionsSheet.columns = [
      { header: 'Column', key: 'column', width: 20 },
      { header: 'Required', key: 'required', width: 12 },
      { header: 'Description', key: 'description', width: 50 },
      { header: 'Example', key: 'example', width: 20 },
    ];

    const instructionsHeader = instructionsSheet.getRow(1);
    instructionsHeader.font = { bold: true, color: { argb: 'FFFFFF' } };
    instructionsHeader.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '70AD47' },
    };

    instructionsSheet.addRows([
      { column: 'apartmentNumber', required: 'Yes', description: 'Unique apartment number/identifier', example: '101, A-12, 3B' },
      { column: 'floor', required: 'Yes', description: 'Floor number (integer)', example: '1, 2, -1 (basement)' },
      { column: 'sizeSqft', required: 'No', description: 'Size in square feet/meters', example: '85, 120' },
      { column: 'status', required: 'No', description: 'active or inactive (default: active)', example: 'active' },
      { column: 'notes', required: 'No', description: 'Additional notes', example: 'Corner unit' },
    ]);

    // Create residents sheet with full columns
    const residentsSheet = workbook.addWorksheet('residents', {
      properties: { tabColor: { argb: 'ED7D31' } },
    });

    residentsSheet.columns = [
      { header: 'apartmentNumber', key: 'apartmentNumber', width: 18 },
      { header: 'fullName', key: 'fullName', width: 25 },
      { header: 'type', key: 'type', width: 12 },
      { header: 'email', key: 'email', width: 25 },
      { header: 'phone', key: 'phone', width: 15 },
      { header: 'moveInAt', key: 'moveInAt', width: 15 },
      { header: 'createUser', key: 'createUser', width: 12 },
      { header: 'tempPassword', key: 'tempPassword', width: 18 },
    ];

    const residentsHeader = residentsSheet.getRow(1);
    residentsHeader.font = { bold: true, color: { argb: 'FFFFFF' } };
    residentsHeader.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'ED7D31' },
    };

    // Add example rows for residents
    residentsSheet.addRow({
      apartmentNumber: '101',
      fullName: 'John Smith',
      type: 'owner',
      email: 'john@example.com',
      phone: '050-1234567',
      moveInAt: '2024-01-15',
      createUser: 'yes',
      tempPassword: 'Welcome123!',
    });
    residentsSheet.addRow({
      apartmentNumber: '102',
      fullName: 'Jane Doe',
      type: 'tenant',
      email: 'jane@example.com',
      phone: '050-7654321',
      moveInAt: '',
      createUser: 'no',
      tempPassword: '',
    });

    // Add residents instructions to instructions sheet
    instructionsSheet.addRow({});
    instructionsSheet.addRow({ column: '--- RESIDENTS SHEET ---', required: '', description: '', example: '' });
    instructionsSheet.addRows([
      { column: 'apartmentNumber', required: 'Yes', description: 'Must match existing apartment number', example: '101' },
      { column: 'fullName', required: 'Yes', description: 'Resident full name', example: 'John Smith' },
      { column: 'type', required: 'No', description: 'owner or tenant (default: owner)', example: 'owner' },
      { column: 'email', required: 'No*', description: 'Email address. *Required if createUser=yes', example: 'john@example.com' },
      { column: 'phone', required: 'No', description: 'Phone number', example: '050-1234567' },
      { column: 'moveInAt', required: 'No', description: 'Move-in date (default: today)', example: '2024-01-15' },
      { column: 'createUser', required: 'No', description: 'yes or no - create login account (default: no)', example: 'yes' },
      { column: 'tempPassword', required: 'No', description: 'Temporary password (auto-generated if empty)', example: 'Welcome123!' },
    ]);

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Return as downloadable file
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="apartments_import_template.xlsx"',
      },
    });
  } catch (error) {
    console.error('[GET /api/import/templates/apartments] Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to generate template' }, { status: 500 });
  }
}

