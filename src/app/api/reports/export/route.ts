import { NextRequest, NextResponse } from 'next/server';
import { getSession, createAuditLog } from '@/lib/api-utils';
import { canManageFinances } from '@/lib/auth';
import {
  getCollectionReport,
  getIncomeVsExpenseReport,
  getOutstandingDebtReport,
  getPaymentReport,
  getVendorExpenseReport,
} from '@/lib/reports/report-service';
import { createExportWorkbook, workbookToBuffer, formatExcelDate } from '@/lib/excel/writeExports';

type ReportType =
  | 'collection'
  | 'outstanding_debt'
  | 'payments'
  | 'vendor_expenses'
  | 'income_vs_expense';

function parseNumber(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function toCsvValue(value: unknown) {
  if (value == null) return '';
  const stringified = String(value).replace(/"/g, '""');
  return `"${stringified}"`;
}

function toCsv(columns: string[], rows: Record<string, unknown>[]) {
  const header = columns.map((col) => toCsvValue(col)).join(',');
  const body = rows
    .map((row) => columns.map((col) => toCsvValue(row[col])).join(','))
    .join('\n');
  return `${header}\n${body}`;
}

// GET /api/reports/export
export async function GET(request: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!canManageFinances(user.role)) {
    return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const reportType = (searchParams.get('report') || '') as ReportType;
  const format = (searchParams.get('format') || 'xlsx').toLowerCase();
  if (!reportType) {
    return NextResponse.json({ success: false, error: 'Missing report parameter' }, { status: 400 });
  }
  if (!['xlsx', 'csv'].includes(format)) {
    return NextResponse.json({ success: false, error: 'Invalid format' }, { status: 400 });
  }

  const month = parseNumber(searchParams.get('month'));
  const year = parseNumber(searchParams.get('year'));
  const from = searchParams.get('from') || undefined;
  const to = searchParams.get('to') || undefined;
  const apartmentId = searchParams.get('apartmentId') || undefined;
  const residentId = searchParams.get('residentId') || undefined;
  const vendorId = searchParams.get('vendorId') || undefined;
  const amountMin = parseNumber(searchParams.get('amountMin'));
  const amountMax = parseNumber(searchParams.get('amountMax'));
  const sortBy = searchParams.get('sortBy') === 'oldest_debt' ? 'oldest_debt' : 'highest_debt';

  let sheetName = 'Report';
  let title = 'Financial Report';
  let columns: string[] = [];
  let rows: Record<string, unknown>[] = [];

  if (reportType === 'collection') {
    const report = await getCollectionReport(user.buildingId, { month, year });
    sheetName = 'Collection';
    title = `Collection ${report.period}`;
    columns = ['Period', 'Total Charged', 'Total Paid', 'Outstanding', 'Collection Rate %', 'Paid Apartments', 'Partial Apartments', 'Unpaid Apartments'];
    rows = [
      {
        Period: report.period,
        'Total Charged': report.totalCharged,
        'Total Paid': report.totalPaid,
        Outstanding: report.outstandingBalance,
        'Collection Rate %': report.collectionRatePct,
        'Paid Apartments': report.paidApartments,
        'Partial Apartments': report.partialApartments,
        'Unpaid Apartments': report.unpaidApartments,
      },
    ];
  } else if (reportType === 'outstanding_debt') {
    const report = await getOutstandingDebtReport(user.buildingId, sortBy);
    sheetName = 'Outstanding Debt';
    title = 'Outstanding Debt Report';
    columns = ['Apartment', 'Resident', 'Current Balance', 'Oldest Debt Date', 'Total Debt', 'Last Payment Date'];
    rows = report.map((row) => ({
      Apartment: row.apartmentNumber,
      Resident: row.residentName,
      'Current Balance': row.currentBalance,
      'Oldest Debt Date': row.oldestDebtDate ? formatExcelDate(row.oldestDebtDate) : '',
      'Total Debt': row.totalDebt,
      'Last Payment Date': row.lastPaymentDate ? formatExcelDate(row.lastPaymentDate) : '',
    }));
  } else if (reportType === 'payments') {
    const report = await getPaymentReport(user.buildingId, { apartmentId, residentId, from, to });
    sheetName = 'Payments';
    title = 'Payment Report';
    columns = ['Payment Date', 'Apartment', 'Resident', 'Amount', 'Currency', 'Method', 'Reference', 'Notes'];
    rows = report.rows.map((row) => ({
      'Payment Date': formatExcelDate(row.paymentDate),
      Apartment: row.apartmentNumber,
      Resident: row.residentName || '',
      Amount: row.amount,
      Currency: row.currency,
      Method: row.method,
      Reference: row.reference || '',
      Notes: row.notes || '',
    }));
  } else if (reportType === 'vendor_expenses') {
    const report = await getVendorExpenseReport(user.buildingId, { month, year, vendorId, amountMin, amountMax });
    sheetName = 'Vendor Expenses';
    title = `Vendor Expenses ${report.period}`;
    columns = ['Vendor', 'Ticket', 'Invoice Number', 'Invoice Date', 'Amount', 'Currency'];
    rows = report.rows.map((row) => ({
      Vendor: row.vendor,
      Ticket: row.ticketTitle,
      'Invoice Number': row.invoiceNumber || '',
      'Invoice Date': row.invoiceDate ? formatExcelDate(row.invoiceDate) : '',
      Amount: row.amount,
      Currency: row.currency,
    }));
  } else if (reportType === 'income_vs_expense') {
    const report = await getIncomeVsExpenseReport(user.buildingId, { month, year });
    sheetName = 'Income vs Expense';
    title = `Income vs Expense ${report.period}`;
    columns = ['Period', 'Total Charges', 'Payments Collected', 'Total Expenses', 'Net Position'];
    rows = [
      {
        Period: report.period,
        'Total Charges': report.totalCharges,
        'Payments Collected': report.paymentsCollected,
        'Total Expenses': report.totalExpenses,
        'Net Position': report.netPosition,
      },
    ];
  } else {
    return NextResponse.json({ success: false, error: 'Invalid report type' }, { status: 400 });
  }

  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'report_exported',
    entityType: 'building',
    entityId: user.buildingId,
    metadata: {
      report: reportType,
      format,
      filters: { month, year, from, to, apartmentId, residentId, vendorId, amountMin, amountMax, sortBy },
      rowCount: rows.length,
    },
  });

  const safeFileName = `${reportType}_${new Date().toISOString().slice(0, 10)}`;
  if (format === 'csv') {
    const csv = toCsv(columns, rows);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeFileName}.csv"`,
      },
    });
  }

  const workbook = await createExportWorkbook({
    sheetName,
    title,
    columns: columns.map((header) => ({ header, key: header, width: 24 })),
    data: rows,
    headerColor: '1F5A7A',
  });
  const buffer = await workbookToBuffer(workbook);
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${safeFileName}.xlsx"`,
    },
  });
}
