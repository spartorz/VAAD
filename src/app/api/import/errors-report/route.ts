import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/api-utils';
import { canManageBuilding } from '@/lib/auth';
import ExcelJS from 'exceljs';

interface ImportError {
  row: number;
  sheet: string;
  field: string;
  message: string;
}

interface PreviewRow {
  apartmentNumber?: string;
  fullName?: string;
  floor?: number;
  type?: string;
  email?: string;
  phone?: string;
  sizeSqft?: number;
  status?: string;
  notes?: string;
  moveInAt?: string;
  action: 'create' | 'update' | 'skip' | 'error';
  skipReason?: string;
  createUser?: boolean;
  userAction?: 'create' | 'skip' | 'error';
  userSkipReason?: string;
}

// POST /api/import/errors-report - Generate Excel error report
export async function POST(request: NextRequest) {
  const user = await getSession();
  
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!canManageBuilding(user.role)) {
    return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { errors, preview, importType } = body as {
      errors: ImportError[];
      preview?: PreviewRow[];
      importType: 'apartments' | 'residents';
    };

    if (!errors || !Array.isArray(errors)) {
      return NextResponse.json({ success: false, error: 'Invalid errors array' }, { status: 400 });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'VAAD Management System';
    workbook.created = new Date();

    // Create errors sheet
    const errorsSheet = workbook.addWorksheet('errors', {
      properties: { tabColor: { argb: 'FF0000' } },
    });

    errorsSheet.columns = [
      { header: 'Row', key: 'row', width: 10 },
      { header: 'Sheet', key: 'sheet', width: 15 },
      { header: 'Field', key: 'field', width: 20 },
      { header: 'Error Message', key: 'message', width: 50 },
    ];

    // Style header row
    const errorsHeader = errorsSheet.getRow(1);
    errorsHeader.font = { bold: true, color: { argb: 'FFFFFF' } };
    errorsHeader.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'C00000' },
    };
    errorsHeader.alignment = { horizontal: 'center' };

    // Add error rows
    errors.forEach((error) => {
      errorsSheet.addRow({
        row: error.row,
        sheet: error.sheet,
        field: error.field,
        message: error.message,
      });
    });

    // Create preview sheet if preview data is provided
    if (preview && preview.length > 0) {
      const previewSheet = workbook.addWorksheet('preview', {
        properties: { tabColor: { argb: '4472C4' } },
      });

      if (importType === 'apartments') {
        previewSheet.columns = [
          { header: 'Apartment Number', key: 'apartmentNumber', width: 18 },
          { header: 'Floor', key: 'floor', width: 10 },
          { header: 'Size (sqft)', key: 'sizeSqft', width: 12 },
          { header: 'Status', key: 'status', width: 12 },
          { header: 'Notes', key: 'notes', width: 30 },
          { header: 'Action', key: 'action', width: 12 },
          { header: 'Skip Reason', key: 'skipReason', width: 40 },
        ];
      } else {
        previewSheet.columns = [
          { header: 'Apartment Number', key: 'apartmentNumber', width: 18 },
          { header: 'Full Name', key: 'fullName', width: 25 },
          { header: 'Type', key: 'type', width: 12 },
          { header: 'Email', key: 'email', width: 25 },
          { header: 'Phone', key: 'phone', width: 15 },
          { header: 'Move In', key: 'moveInAt', width: 15 },
          { header: 'Action', key: 'action', width: 12 },
          { header: 'Skip Reason', key: 'skipReason', width: 40 },
          { header: 'User Action', key: 'userAction', width: 12 },
          { header: 'User Skip Reason', key: 'userSkipReason', width: 40 },
        ];
      }

      // Style header row
      const previewHeader = previewSheet.getRow(1);
      previewHeader.font = { bold: true, color: { argb: 'FFFFFF' } };
      previewHeader.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '4472C4' },
      };
      previewHeader.alignment = { horizontal: 'center' };

      // Add preview rows with conditional formatting
      preview.forEach((row) => {
        const dataRow = previewSheet.addRow(row);
        
        // Color code by action
        if (row.action === 'error') {
          dataRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFCCCC' },
          };
        } else if (row.action === 'skip') {
          dataRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFCC' },
          };
        } else if (row.action === 'create') {
          dataRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'CCFFCC' },
          };
        } else if (row.action === 'update') {
          dataRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'CCE5FF' },
          };
        }
      });
    }

    // Create summary sheet
    const summarySheet = workbook.addWorksheet('summary', {
      properties: { tabColor: { argb: '70AD47' } },
    });

    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 25 },
      { header: 'Value', key: 'value', width: 15 },
    ];

    const summaryHeader = summarySheet.getRow(1);
    summaryHeader.font = { bold: true, color: { argb: 'FFFFFF' } };
    summaryHeader.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '70AD47' },
    };

    // Calculate summary
    const totalErrors = errors.length;
    const createCount = preview?.filter(r => r.action === 'create').length || 0;
    const updateCount = preview?.filter(r => r.action === 'update').length || 0;
    const skipCount = preview?.filter(r => r.action === 'skip').length || 0;
    const errorCount = preview?.filter(r => r.action === 'error').length || 0;

    summarySheet.addRows([
      { metric: 'Import Type', value: importType },
      { metric: 'Generated At', value: new Date().toISOString() },
      { metric: 'Total Rows', value: preview?.length || 0 },
      { metric: 'To Create', value: createCount },
      { metric: 'To Update', value: updateCount },
      { metric: 'Skipped', value: skipCount },
      { metric: 'Errors', value: errorCount },
      { metric: 'Total Validation Errors', value: totalErrors },
    ]);

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Return as downloadable file
    const filename = `import_error_report_${importType}_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('[POST /api/import/errors-report] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to generate error report' 
    }, { status: 500 });
  }
}

