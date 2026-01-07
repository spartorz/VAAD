import { NextRequest, NextResponse } from 'next/server';
import { getSession, createAuditLog } from '@/lib/api-utils';
import { canManageFinances } from '@/lib/auth';
import Charge from '@/models/Charge';
import Payment from '@/models/Payment';
import Apartment from '@/models/Apartment';
import Resident from '@/models/Resident';
import Building from '@/models/Building';
import dbConnect from '@/lib/db';
import { Types } from 'mongoose';
import { createExportWorkbook, workbookToBuffer, formatExcelDate } from '@/lib/excel/writeExports';

// GET /api/exports/billing/monthly - Export monthly billing summary to Excel
export async function GET(request: NextRequest) {
  const user = await getSession();
  
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!canManageFinances(user.role)) {
    return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period');

  // Validate period format (YYYY-MM)
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ success: false, error: 'Invalid period format. Use YYYY-MM' }, { status: 400 });
  }

  try {
    await dbConnect();

    const buildingId = new Types.ObjectId(user.buildingId);

    // Get building info
    const building = await Building.findById(buildingId).lean();
    if (!building) {
      return NextResponse.json({ success: false, error: 'Building not found' }, { status: 404 });
    }

    // Get all active apartments
    const apartments = await Apartment.find({
      buildingId,
      status: 'active',
    })
      .sort({ number: 1 })
      .lean();

    // Get all monthly_due charges for this period
    const charges = await Charge.find({
      buildingId,
      type: 'monthly_due',
      period,
      status: 'open',
    }).lean();

    const chargeMap = new Map(
      charges.map((c) => [c.apartmentId.toString(), c])
    );

    // Get date range for the period
    const [year, month] = period.split('-').map(Number);
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    // Get all confirmed payments for this month
    const payments = await Payment.find({
      buildingId,
      status: 'confirmed',
      paidAt: {
        $gte: startOfMonth,
        $lte: endOfMonth,
      },
    }).lean();

    // Create payments map by apartment
    const paymentsMap = new Map<string, typeof payments>();
    for (const payment of payments) {
      const aptId = payment.apartmentId.toString();
      if (!paymentsMap.has(aptId)) {
        paymentsMap.set(aptId, []);
      }
      paymentsMap.get(aptId)!.push(payment);
    }

    // Get residents for each apartment
    const residents = await Resident.find({
      buildingId,
      isActive: true,
    }).lean();

    const residentMap = new Map<string, typeof residents[0]>();
    for (const resident of residents) {
      const aptId = resident.apartmentId.toString();
      // Store first resident found (owner preferred)
      if (!residentMap.has(aptId) || resident.type === 'owner') {
        residentMap.set(aptId, resident);
      }
    }

    // Build export data
    const exportData = apartments.map((apt) => {
      const aptId = apt._id.toString();
      const charge = chargeMap.get(aptId);
      const aptPayments = paymentsMap.get(aptId) || [];
      const resident = residentMap.get(aptId);
      
      const monthlyDue = charge?.amount ?? 0;
      const paidThisMonth = aptPayments.reduce((sum, p) => sum + p.amount, 0);
      const remaining = Math.max(0, monthlyDue - paidThisMonth);

      let status: string;
      if (!charge) {
        status = 'לא חויב';
      } else if (remaining <= 0) {
        status = 'שולם';
      } else if (paidThisMonth > 0) {
        status = 'חלקי';
      } else {
        status = 'לא שולם';
      }

      // Get last payment info
      const lastPayment = aptPayments.sort((a, b) => 
        new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime()
      )[0];

      return {
        apartmentNumber: apt.number,
        residentName: resident?.fullName || '',
        monthlyDue: monthlyDue.toFixed(2),
        paidThisMonth: paidThisMonth.toFixed(2),
        remaining: remaining.toFixed(2),
        status,
        lastPaymentDate: lastPayment ? formatExcelDate(lastPayment.paidAt) : '',
        paymentMethod: lastPayment?.method || '',
        reference: `VAAD-${apt.number}-${period}`,
      };
    });

    // Create Excel workbook
    const workbook = await createExportWorkbook({
      sheetName: `גביה ${period}`,
      title: `דוח גביה חודשי - ${period}`,
      columns: [
        { header: 'מספר דירה', key: 'apartmentNumber', width: 12 },
        { header: 'שם דייר', key: 'residentName', width: 25 },
        { header: 'חיוב חודשי', key: 'monthlyDue', width: 12 },
        { header: 'שולם החודש', key: 'paidThisMonth', width: 12 },
        { header: 'יתרה', key: 'remaining', width: 12 },
        { header: 'סטטוס', key: 'status', width: 12 },
        { header: 'תאריך תשלום אחרון', key: 'lastPaymentDate', width: 18 },
        { header: 'אמצעי תשלום', key: 'paymentMethod', width: 15 },
        { header: 'אסמכתא', key: 'reference', width: 20 },
      ],
      data: exportData,
      headerColor: '4472C4',
    });

    // Add summary row at the bottom
    const sheet = workbook.getWorksheet(1);
    if (sheet) {
      const totalRow = sheet.addRow({
        apartmentNumber: 'סה"כ',
        residentName: '',
        monthlyDue: exportData.reduce((sum, r) => sum + parseFloat(r.monthlyDue), 0).toFixed(2),
        paidThisMonth: exportData.reduce((sum, r) => sum + parseFloat(r.paidThisMonth), 0).toFixed(2),
        remaining: exportData.reduce((sum, r) => sum + parseFloat(r.remaining), 0).toFixed(2),
        status: '',
        lastPaymentDate: '',
        paymentMethod: '',
        reference: '',
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
      action: 'export_billing_monthly',
      entityType: 'charge',
      entityId: period,
      metadata: {
        period,
        totalApartments: apartments.length,
        totalRecords: exportData.length,
      },
    });

    const filename = `monthly_collections_${period}.xlsx`;
    
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('[GET /api/exports/billing/monthly] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to export billing' 
    }, { status: 500 });
  }
}

