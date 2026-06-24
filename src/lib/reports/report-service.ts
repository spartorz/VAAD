import { Types } from 'mongoose';
import Charge from '@/models/Charge';
import Payment from '@/models/Payment';
import MaintenanceTicket from '@/models/MaintenanceTicket';

export interface PeriodInput {
  month?: number;
  year?: number;
}

export interface DateRangeInput {
  from?: string;
  to?: string;
}

export interface CollectionReport {
  period: string;
  totalCharged: number;
  totalPaid: number;
  outstandingBalance: number;
  collectionRatePct: number;
  paidApartments: number;
  partialApartments: number;
  unpaidApartments: number;
}

export interface OutstandingDebtRow {
  apartmentId: string;
  apartmentNumber: string;
  residentName: string;
  currentBalance: number;
  oldestDebtDate?: string;
  totalDebt: number;
  lastPaymentDate?: string;
}

export interface PaymentReportRow {
  paymentId: string;
  paymentDate: string;
  apartmentId: string;
  apartmentNumber: string;
  residentId?: string;
  residentName?: string;
  amount: number;
  currency: string;
  method: string;
  reference?: string;
  notes?: string;
}

export interface VendorExpenseRow {
  vendorId?: string;
  vendor: string;
  ticketId: string;
  ticketTitle: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  amount: number;
  currency: string;
}

export interface VendorExpenseReport {
  period: string;
  totalExpenses: number;
  topVendor: string;
  averageVendorCost: number;
  rows: VendorExpenseRow[];
}

export interface IncomeVsExpenseReport {
  period: string;
  totalCharges: number;
  paymentsCollected: number;
  totalExpenses: number;
  netPosition: number;
}

function resolvePeriod(period?: PeriodInput) {
  const now = new Date();
  const year = period?.year && period.year >= 2000 ? period.year : now.getFullYear();
  const month = period?.month && period.month >= 1 && period.month <= 12 ? period.month : now.getMonth() + 1;
  const periodLabel = `${year}-${String(month).padStart(2, '0')}`;
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { year, month, periodLabel, start, end };
}

function resolveDateRange(dateRange?: DateRangeInput) {
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const from = dateRange?.from ? new Date(dateRange.from) : defaultFrom;
  const to = dateRange?.to ? new Date(dateRange.to) : defaultTo;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { from: defaultFrom, to: defaultTo };
  }
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

export async function getCollectionReport(buildingId: string, period?: PeriodInput): Promise<CollectionReport> {
  const { periodLabel, start, end } = resolvePeriod(period);
  const buildingObjectId = new Types.ObjectId(buildingId);

  const [chargeByApartment, paymentByApartment] = await Promise.all([
    Charge.aggregate([
      {
        $match: {
          buildingId: buildingObjectId,
          type: 'monthly_due',
          period: periodLabel,
          status: 'open',
        },
      },
      { $group: { _id: '$apartmentId', amount: { $sum: '$amount' } } },
    ]),
    Payment.aggregate([
      {
        $match: {
          buildingId: buildingObjectId,
          status: 'confirmed',
          paidAt: { $gte: start, $lte: end },
        },
      },
      { $group: { _id: '$apartmentId', amount: { $sum: '$amount' } } },
    ]),
  ]);

  const paymentMap = new Map<string, number>(
    paymentByApartment.map((item) => [String(item._id), Number(item.amount) || 0])
  );

  let totalCharged = 0;
  let totalPaid = 0;
  let paidApartments = 0;
  let partialApartments = 0;
  let unpaidApartments = 0;

  for (const charge of chargeByApartment) {
    const apartmentId = String(charge._id);
    const due = Number(charge.amount) || 0;
    const paid = paymentMap.get(apartmentId) || 0;
    const remaining = Math.max(0, due - paid);

    totalCharged += due;
    totalPaid += paid;

    if (remaining <= 0) paidApartments += 1;
    else if (paid > 0) partialApartments += 1;
    else unpaidApartments += 1;
  }

  const outstandingBalance = Math.max(0, totalCharged - totalPaid);
  const collectionRatePct = totalCharged > 0 ? Number(((totalPaid / totalCharged) * 100).toFixed(1)) : 0;

  return {
    period: periodLabel,
    totalCharged,
    totalPaid,
    outstandingBalance,
    collectionRatePct,
    paidApartments,
    partialApartments,
    unpaidApartments,
  };
}

export async function getOutstandingDebtReport(
  buildingId: string,
  sortBy: 'highest_debt' | 'oldest_debt' = 'highest_debt'
): Promise<OutstandingDebtRow[]> {
  const buildingObjectId = new Types.ObjectId(buildingId);

  const rows = await Charge.aggregate([
    {
      $match: {
        buildingId: buildingObjectId,
        status: 'open',
      },
    },
    {
      $group: {
        _id: '$apartmentId',
        totalCharges: { $sum: '$amount' },
        oldestDebtDate: { $min: '$dueDate' },
      },
    },
    {
      $lookup: {
        from: 'payments',
        let: { apartmentId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$buildingId', buildingObjectId] },
                  { $eq: ['$apartmentId', '$$apartmentId'] },
                  { $eq: ['$status', 'confirmed'] },
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              totalPayments: { $sum: '$amount' },
              lastPaymentDate: { $max: '$paidAt' },
            },
          },
        ],
        as: 'paymentsAgg',
      },
    },
    {
      $lookup: {
        from: 'apartments',
        localField: '_id',
        foreignField: '_id',
        as: 'apartment',
      },
    },
    {
      $lookup: {
        from: 'residents',
        let: { apartmentId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$buildingId', buildingObjectId] },
                  { $eq: ['$apartmentId', '$$apartmentId'] },
                  { $eq: ['$isActive', true] },
                ],
              },
            },
          },
          { $sort: { type: 1, createdAt: 1 } },
          { $limit: 1 },
          { $project: { fullName: 1 } },
        ],
        as: 'resident',
      },
    },
    {
      $addFields: {
        paymentResolved: { $arrayElemAt: ['$paymentsAgg', 0] },
        apartmentResolved: { $arrayElemAt: ['$apartment', 0] },
        residentResolved: { $arrayElemAt: ['$resident', 0] },
      },
    },
    {
      $addFields: {
        totalDebt: {
          $max: [
            0,
            {
              $subtract: ['$totalCharges', { $ifNull: ['$paymentResolved.totalPayments', 0] }],
            },
          ],
        },
      },
    },
    { $match: { totalDebt: { $gt: 0 } } },
    {
      $project: {
        _id: 1,
        apartmentNumber: '$apartmentResolved.number',
        residentName: '$residentResolved.fullName',
        totalDebt: 1,
        currentBalance: '$totalDebt',
        oldestDebtDate: 1,
        lastPaymentDate: '$paymentResolved.lastPaymentDate',
      },
    },
    { $sort: sortBy === 'oldest_debt' ? { oldestDebtDate: 1 } : { totalDebt: -1 } },
  ]);

  return rows.map((row) => ({
    apartmentId: String(row._id),
    apartmentNumber: row.apartmentNumber || '-',
    residentName: row.residentName || '-',
    currentBalance: Number(row.currentBalance || 0),
    oldestDebtDate: row.oldestDebtDate ? new Date(row.oldestDebtDate).toISOString() : undefined,
    totalDebt: Number(row.totalDebt || 0),
    lastPaymentDate: row.lastPaymentDate ? new Date(row.lastPaymentDate).toISOString() : undefined,
  }));
}

export async function getPaymentReport(
  buildingId: string,
  filters?: { apartmentId?: string; residentId?: string; from?: string; to?: string }
): Promise<{ totals: { count: number; totalAmount: number }; rows: PaymentReportRow[] }> {
  const buildingObjectId = new Types.ObjectId(buildingId);
  const { from, to } = resolveDateRange({ from: filters?.from, to: filters?.to });

  const match: Record<string, unknown> = {
    buildingId: buildingObjectId,
    status: { $ne: 'voided' },
    paidAt: { $gte: from, $lte: to },
  };
  if (filters?.apartmentId && Types.ObjectId.isValid(filters.apartmentId)) {
    match.apartmentId = new Types.ObjectId(filters.apartmentId);
  }
  if (filters?.residentId && Types.ObjectId.isValid(filters.residentId)) {
    match.residentId = new Types.ObjectId(filters.residentId);
  }

  const rows = await Payment.aggregate([
    { $match: match },
    {
      $lookup: {
        from: 'apartments',
        localField: 'apartmentId',
        foreignField: '_id',
        as: 'apartment',
      },
    },
    {
      $lookup: {
        from: 'residents',
        localField: 'residentId',
        foreignField: '_id',
        as: 'resident',
      },
    },
    {
      $addFields: {
        apartmentResolved: { $arrayElemAt: ['$apartment', 0] },
        residentResolved: { $arrayElemAt: ['$resident', 0] },
      },
    },
    { $sort: { paidAt: -1, createdAt: -1 } },
    {
      $project: {
        _id: 1,
        paidAt: 1,
        apartmentId: 1,
        apartmentNumber: '$apartmentResolved.number',
        residentId: 1,
        residentName: '$residentResolved.fullName',
        amount: 1,
        currency: 1,
        method: 1,
        reference: 1,
      },
    },
  ]);

  const mapped: PaymentReportRow[] = rows.map((row) => ({
    paymentId: String(row._id),
    paymentDate: new Date(row.paidAt).toISOString(),
    apartmentId: String(row.apartmentId),
    apartmentNumber: row.apartmentNumber || '-',
    residentId: row.residentId ? String(row.residentId) : undefined,
    residentName: row.residentName || undefined,
    amount: Number(row.amount || 0),
    currency: row.currency || 'ILS',
    method: row.method || 'other',
    reference: row.reference || undefined,
    notes: undefined,
  }));

  const totalAmount = mapped.reduce((sum, row) => sum + row.amount, 0);
  return {
    totals: { count: mapped.length, totalAmount },
    rows: mapped,
  };
}

export async function getVendorExpenseReport(
  buildingId: string,
  filters?: { month?: number; year?: number; vendorId?: string; amountMin?: number; amountMax?: number }
): Promise<VendorExpenseReport> {
  const { periodLabel, start, end } = resolvePeriod({ month: filters?.month, year: filters?.year });
  const buildingObjectId = new Types.ObjectId(buildingId);

  const match: Record<string, unknown> = {
    buildingId: buildingObjectId,
    costAmount: { $gt: 0 },
    closedAt: { $gte: start, $lte: end },
  };
  if (filters?.vendorId && Types.ObjectId.isValid(filters.vendorId)) {
    match.vendorId = new Types.ObjectId(filters.vendorId);
  }
  if (typeof filters?.amountMin === 'number' || typeof filters?.amountMax === 'number') {
    const amountRange: Record<string, number> = { $gt: 0 };
    if (typeof filters?.amountMin === 'number') amountRange.$gte = filters.amountMin;
    if (typeof filters?.amountMax === 'number') amountRange.$lte = filters.amountMax;
    match.costAmount = amountRange;
  }

  const rows = await MaintenanceTicket.aggregate([
    { $match: match },
    {
      $lookup: {
        from: 'vendors',
        localField: 'vendorId',
        foreignField: '_id',
        as: 'vendor',
      },
    },
    {
      $addFields: {
        vendorResolved: { $arrayElemAt: ['$vendor', 0] },
      },
    },
    { $sort: { closedAt: -1, updatedAt: -1 } },
    {
      $project: {
        _id: 1,
        ticketTitle: '$title',
        vendorId: '$vendorResolved._id',
        vendor: '$vendorResolved.name',
        invoiceNumber: 1,
        invoiceDate: 1,
        amount: '$costAmount',
        currency: '$costCurrency',
      },
    },
  ]);

  const mappedRows: VendorExpenseRow[] = rows.map((row) => ({
    vendorId: row.vendorId ? String(row.vendorId) : undefined,
    vendor: row.vendor || 'ללא ספק',
    ticketId: String(row._id),
    ticketTitle: row.ticketTitle || '-',
    invoiceNumber: row.invoiceNumber || undefined,
    invoiceDate: row.invoiceDate ? new Date(row.invoiceDate).toISOString() : undefined,
    amount: Number(row.amount || 0),
    currency: row.currency || 'ILS',
  }));

  const totalExpenses = mappedRows.reduce((sum, row) => sum + row.amount, 0);
  const vendorTotals = new Map<string, { name: string; total: number }>();
  for (const row of mappedRows) {
    const key = row.vendorId || row.vendor;
    const current = vendorTotals.get(key) || { name: row.vendor, total: 0 };
    current.total += row.amount;
    vendorTotals.set(key, current);
  }
  const topVendorEntry = Array.from(vendorTotals.values()).sort((a, b) => b.total - a.total)[0];
  const averageVendorCost = vendorTotals.size > 0 ? Number((totalExpenses / vendorTotals.size).toFixed(2)) : 0;

  return {
    period: periodLabel,
    totalExpenses,
    topVendor: topVendorEntry?.name || '—',
    averageVendorCost,
    rows: mappedRows,
  };
}

export async function getIncomeVsExpenseReport(
  buildingId: string,
  period?: PeriodInput
): Promise<IncomeVsExpenseReport> {
  const { periodLabel, start, end } = resolvePeriod(period);
  const buildingObjectId = new Types.ObjectId(buildingId);

  const [chargesAgg, paymentsAgg, expensesAgg] = await Promise.all([
    Charge.aggregate([
      {
        $match: {
          buildingId: buildingObjectId,
          status: 'open',
          type: 'monthly_due',
          period: periodLabel,
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Payment.aggregate([
      {
        $match: {
          buildingId: buildingObjectId,
          status: 'confirmed',
          paidAt: { $gte: start, $lte: end },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    MaintenanceTicket.aggregate([
      {
        $match: {
          buildingId: buildingObjectId,
          costAmount: { $gt: 0 },
          closedAt: { $gte: start, $lte: end },
        },
      },
      { $group: { _id: null, total: { $sum: '$costAmount' } } },
    ]),
  ]);

  const totalCharges = Number(chargesAgg[0]?.total || 0);
  const paymentsCollected = Number(paymentsAgg[0]?.total || 0);
  const totalExpenses = Number(expensesAgg[0]?.total || 0);
  const netPosition = paymentsCollected - totalExpenses;

  return {
    period: periodLabel,
    totalCharges,
    paymentsCollected,
    totalExpenses,
    netPosition,
  };
}
