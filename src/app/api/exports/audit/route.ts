import { NextRequest, NextResponse } from 'next/server';
import { getSession, createAuditLog } from '@/lib/api-utils';
import { canManageBuilding } from '@/lib/auth';
import AuditLog from '@/models/AuditLog';
import dbConnect from '@/lib/db';
import { Types } from 'mongoose';
import { createExportWorkbook, workbookToBuffer, formatExcelDate } from '@/lib/excel/writeExports';

// GET /api/exports/audit - Export audit logs to Excel
export async function GET(request: NextRequest) {
  const user = await getSession();
  
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!canManageBuilding(user.role)) {
    return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  // Validate date parameters
  if (!from || !to) {
    return NextResponse.json({ success: false, error: 'Missing from/to date parameters' }, { status: 400 });
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return NextResponse.json({ success: false, error: 'Invalid date format' }, { status: 400 });
  }

  try {
    await dbConnect();

    const buildingId = new Types.ObjectId(user.buildingId);

    // Get audit logs in date range
    const logs = await AuditLog.find({
      buildingId,
      createdAt: {
        $gte: fromDate,
        $lte: toDate,
      },
    })
      .sort({ createdAt: -1 })
      .lean();

    // Action translation map
    const actionMap: Record<string, string> = {
      create: 'יצירה',
      update: 'עדכון',
      void: 'ביטול',
      delete: 'מחיקה',
      login: 'התחברות',
      generate_charges: 'יצירת חיובים',
      import_data: 'ייבוא נתונים',
      import_apartments: 'ייבוא דירות',
      import_residents: 'ייבוא דיירים',
      export_billing_monthly: 'ייצוא גביה חודשית',
      export_apartments: 'ייצוא דירות',
      export_residents: 'ייצוא דיירים',
      export_payments: 'ייצוא תשלומים',
      export_audit: 'ייצוא יומן',
      invoice_view: 'צפייה בחשבונית',
      invoice_download: 'הורדת חשבונית',
      invoice_issued: 'הנפקת חשבונית',
      invoice_pdf_download: 'הורדת PDF חשבונית',
    };

    // Entity type translation map
    const entityMap: Record<string, string> = {
      apartment: 'דירה',
      resident: 'דייר',
      charge: 'חיוב',
      payment: 'תשלום',
      ticket: 'קריאת שירות',
      document: 'מסמך',
      building: 'בניין',
      user: 'משתמש',
      vendor: 'ספק',
    };

    // Build export data
    const exportData = logs.map((log) => ({
      createdAt: formatExcelDate(log.createdAt),
      time: new Date(log.createdAt).toLocaleTimeString('he-IL'),
      actorName: log.actorName,
      action: actionMap[log.action] || log.action,
      entityType: entityMap[log.entityType] || log.entityType,
      entityId: log.entityId || '',
      metadata: log.metadata ? JSON.stringify(log.metadata) : '',
    }));

    // Create Excel workbook
    const workbook = await createExportWorkbook({
      sheetName: 'יומן פעולות',
      title: `יומן פעולות ${formatExcelDate(fromDate)} - ${formatExcelDate(toDate)}`,
      columns: [
        { header: 'תאריך', key: 'createdAt', width: 12 },
        { header: 'שעה', key: 'time', width: 10 },
        { header: 'משתמש', key: 'actorName', width: 20 },
        { header: 'פעולה', key: 'action', width: 18 },
        { header: 'סוג ישות', key: 'entityType', width: 15 },
        { header: 'מזהה', key: 'entityId', width: 25 },
        { header: 'מטא דאטה', key: 'metadata', width: 40 },
      ],
      data: exportData,
      headerColor: '7030A0',
    });

    const buffer = await workbookToBuffer(workbook);

    // Create audit log for this export
    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'export_audit',
      entityType: 'building',
      entityId: buildingId.toString(),
      metadata: {
        from,
        to,
        totalRecords: logs.length,
      },
    });

    const filename = `audit_log_export_${from}_${to}.xlsx`;
    
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('[GET /api/exports/audit] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to export audit logs' 
    }, { status: 500 });
  }
}

