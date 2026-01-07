import { NextRequest, NextResponse } from 'next/server';
import { getSession, createAuditLog } from '@/lib/api-utils';
import { canManageFinances } from '@/lib/auth';
import Payment from '@/models/Payment';
import dbConnect from '@/lib/db';
import { Types } from 'mongoose';
import { createExportWorkbook, workbookToBuffer, formatExcelDate } from '@/lib/excel/writeExports';

// GET /api/exports/payments - Export payments to Excel
export async function GET(request: NextRequest) {
  const user = await getSession();
  
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!canManageFinances(user.role)) {
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

    // Get payments in date range
    const payments = await Payment.find({
      buildingId,
      paidAt: {
        $gte: fromDate,
        $lte: toDate,
      },
    })
      .populate('apartmentId', 'number')
      .populate('createdBy', 'name')
      .sort({ paidAt: -1 })
      .lean();

    // Method translation map
    const methodMap: Record<string, string> = {
      cash: 'מזומן',
      check: "צ'ק",
      bank_transfer: 'העברה בנקאית',
      credit_card: 'כרטיס אשראי',
      bit: 'ביט',
      paybox: 'פייבוקס',
      other: 'אחר',
    };

    // Status translation map
    const statusMap: Record<string, string> = {
      confirmed: 'אושר',
      pending: 'ממתין',
      voided: 'בוטל',
    };

    // Build export data
    const exportData = payments.map((payment) => {
      const apt = payment.apartmentId as unknown as { number: string } | null;
      const creator = payment.createdBy as unknown as { name: string } | null;
      return {
        paidAt: formatExcelDate(payment.paidAt),
        amount: payment.amount.toFixed(2),
        method: methodMap[payment.method] || payment.method,
        reference: payment.reference || '',
        apartmentNumber: apt?.number || '',
        status: statusMap[payment.status] || payment.status,
        createdBy: creator?.name || '',
      };
    });

    // Create Excel workbook
    const workbook = await createExportWorkbook({
      sheetName: 'תשלומים',
      title: `דוח תשלומים ${formatExcelDate(fromDate)} - ${formatExcelDate(toDate)}`,
      columns: [
        { header: 'תאריך תשלום', key: 'paidAt', width: 15 },
        { header: 'סכום', key: 'amount', width: 12 },
        { header: 'אמצעי תשלום', key: 'method', width: 15 },
        { header: 'אסמכתא', key: 'reference', width: 18 },
        { header: 'דירה', key: 'apartmentNumber', width: 12 },
        { header: 'סטטוס', key: 'status', width: 10 },
        { header: 'נרשם ע"י', key: 'createdBy', width: 20 },
      ],
      data: exportData,
      headerColor: '5B9BD5',
    });

    // Add summary row
    const sheet = workbook.getWorksheet(1);
    if (sheet) {
      const totalRow = sheet.addRow({
        paidAt: 'סה"כ',
        amount: exportData.reduce((sum, r) => sum + parseFloat(r.amount), 0).toFixed(2),
        method: '',
        reference: '',
        apartmentNumber: '',
        status: '',
        createdBy: `${exportData.length} תשלומים`,
      });
      totalRow.font = { bold: true };
      totalRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'E2EFDA' },
      };
    }

    const buffer = await workbookToBuffer(workbook);

    // Create audit log
    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'export_payments',
      entityType: 'payment',
      entityId: buildingId.toString(),
      metadata: {
        from,
        to,
        totalRecords: payments.length,
      },
    });

    const filename = `payments_export_${from}_${to}.xlsx`;
    
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('[GET /api/exports/payments] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to export payments' 
    }, { status: 500 });
  }
}

