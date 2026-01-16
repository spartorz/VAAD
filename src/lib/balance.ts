import Charge from '@/models/Charge';
import Payment from '@/models/Payment';
import { Types } from 'mongoose';

export interface BalanceResult {
  totalCharges: number;
  totalPayments: number;
  balance: number;
  currency: string;
}

export interface StatementEntry {
  _id: string;
  date: Date;
  type: 'charge' | 'payment';
  title: string;
  amount: number;
  balance: number;
  status: string;
  reference?: string;
}

// Calculate balance for a single apartment
export async function calculateApartmentBalance(
  buildingId: string,
  apartmentId: string
): Promise<BalanceResult> {
  const buildingObjId = new Types.ObjectId(buildingId);
  const apartmentObjId = new Types.ObjectId(apartmentId);

  // Get sum of open charges
  const chargesResult = await Charge.aggregate([
    {
      $match: {
        buildingId: buildingObjId,
        apartmentId: apartmentObjId,
        status: 'open',
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$amount' },
        currency: { $first: '$currency' },
      },
    },
  ]);

  // Get sum of confirmed payments
  const paymentsResult = await Payment.aggregate([
    {
      $match: {
        buildingId: buildingObjId,
        apartmentId: apartmentObjId,
        status: 'confirmed',
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$amount' },
      },
    },
  ]);

  const totalCharges = chargesResult[0]?.total || 0;
  const totalPayments = paymentsResult[0]?.total || 0;
  const currency = chargesResult[0]?.currency || 'USD';

  return {
    totalCharges,
    totalPayments,
    balance: totalCharges - totalPayments,
    currency,
  };
}

// Calculate balances for all apartments in a building
export async function calculateBuildingBalances(
  buildingId: string
): Promise<Map<string, BalanceResult>> {
  const buildingObjId = new Types.ObjectId(buildingId);

  // Get charges by apartment
  const chargesByApartment = await Charge.aggregate([
    {
      $match: {
        buildingId: buildingObjId,
        status: 'open',
      },
    },
    {
      $group: {
        _id: '$apartmentId',
        total: { $sum: '$amount' },
        currency: { $first: '$currency' },
      },
    },
  ]);

  // Get payments by apartment
  const paymentsByApartment = await Payment.aggregate([
    {
      $match: {
        buildingId: buildingObjId,
        status: 'confirmed',
      },
    },
    {
      $group: {
        _id: '$apartmentId',
        total: { $sum: '$amount' },
      },
    },
  ]);

  const chargesMap = new Map(
    chargesByApartment.map((c) => [c._id.toString(), { total: c.total, currency: c.currency }])
  );
  const paymentsMap = new Map(
    paymentsByApartment.map((p) => [p._id.toString(), p.total])
  );

  // Combine into balance map
  const allApartmentIds = new Set([...chargesMap.keys(), ...paymentsMap.keys()]);
  const balances = new Map<string, BalanceResult>();

  for (const apartmentId of allApartmentIds) {
    const charges = chargesMap.get(apartmentId) || { total: 0, currency: 'USD' };
    const payments = paymentsMap.get(apartmentId) || 0;

    balances.set(apartmentId, {
      totalCharges: charges.total,
      totalPayments: payments,
      balance: charges.total - payments,
      currency: charges.currency,
    });
  }

  return balances;
}

// Get apartment statement (chronological list of charges and payments)
export async function getApartmentStatement(
  buildingId: string,
  apartmentId: string,
  startDate?: Date,
  endDate?: Date
): Promise<StatementEntry[]> {
  const buildingObjId = new Types.ObjectId(buildingId);
  const apartmentObjId = new Types.ObjectId(apartmentId);

  const dateFilter: Record<string, Date> = {};
  if (startDate) dateFilter.$gte = startDate;
  if (endDate) dateFilter.$lte = endDate;

  // Get charges
  const chargesQuery: Record<string, unknown> = {
    buildingId: buildingObjId,
    apartmentId: apartmentObjId,
  };
  if (Object.keys(dateFilter).length > 0) {
    chargesQuery.dueDate = dateFilter;
  }

  const charges = await Charge.find(chargesQuery).lean();

  // Get payments
  const paymentsQuery: Record<string, unknown> = {
    buildingId: buildingObjId,
    apartmentId: apartmentObjId,
  };
  if (Object.keys(dateFilter).length > 0) {
    paymentsQuery.paidAt = dateFilter;
  }

  const payments = await Payment.find(paymentsQuery).lean();

  // Combine and sort by date
  const entries: StatementEntry[] = [
    ...charges.map((c) => ({
      _id: c._id.toString(),
      date: c.dueDate,
      type: 'charge' as const,
      title: c.title,
      amount: c.status === 'voided' ? 0 : c.amount,
      balance: 0, // Will calculate running balance
      status: c.status,
    })),
    ...payments.map((p) => ({
      _id: p._id.toString(),
      date: p.paidAt,
      type: 'payment' as const,
      title: `Payment - ${p.method}`,
      amount: p.status === 'voided' ? 0 : -p.amount,
      balance: 0,
      status: p.status,
      reference: p.reference,
    })),
  ];

  // Sort by date (oldest first)
  entries.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Calculate running balance
  let runningBalance = 0;
  for (const entry of entries) {
    if (entry.status !== 'voided') {
      runningBalance += entry.amount;
    }
    entry.balance = runningBalance;
  }

  return entries;
}

// Calculate debt status for a single apartment
// Returns true if apartment has debt, false otherwise
export async function calculateApartmentDebtStatus(
  buildingId: string,
  apartmentId: string
): Promise<boolean> {
  const buildingObjId = new Types.ObjectId(buildingId);
  const apartmentObjId = new Types.ObjectId(apartmentId);

  // Get current month in YYYY-MM format
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Check for monthly charge for current month
  const monthlyCharge = await Charge.findOne({
    buildingId: buildingObjId,
    apartmentId: apartmentObjId,
    type: 'monthly_due',
    period: currentPeriod,
    status: 'open',
  }).lean();

  // Calculate date range for current month
  const [year, month] = currentPeriod.split('-').map(Number);
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

  // Get payments for current month
  const paymentsResult = await Payment.aggregate([
    {
      $match: {
        buildingId: buildingObjId,
        apartmentId: apartmentObjId,
        status: 'confirmed',
        paidAt: {
          $gte: startOfMonth,
          $lte: endOfMonth,
        },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$amount' },
      },
    },
  ]);

  const monthlyChargeAmount = monthlyCharge?.amount || 0;
  const paidThisMonth = paymentsResult[0]?.total || 0;

  // Check if monthly charge is not fully paid
  if (monthlyChargeAmount > paidThisMonth) {
    return true; // Has debt
  }

  // Check for special charges (non-monthly_due or monthly_due with different period)
  const specialChargesResult = await Charge.aggregate([
    {
      $match: {
        buildingId: buildingObjId,
        apartmentId: apartmentObjId,
        status: 'open',
        $or: [
          { type: { $ne: 'monthly_due' } },
          { type: 'monthly_due', period: { $ne: currentPeriod } },
        ],
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$amount' },
      },
    },
  ]);

  const specialChargesAmount = specialChargesResult[0]?.total || 0;

  // If there are special charges, apartment has debt
  if (specialChargesAmount > 0) {
    return true; // Has debt
  }

  return false; // No debt
}

// Calculate debt statuses for all apartments in a building
export async function calculateBuildingDebtStatuses(
  buildingId: string
): Promise<Map<string, boolean>> {
  const buildingObjId = new Types.ObjectId(buildingId);

  // Get current month in YYYY-MM format
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Calculate date range for current month
  const [year, month] = currentPeriod.split('-').map(Number);
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

  // Get all monthly charges for current month
  const monthlyCharges = await Charge.find({
    buildingId: buildingObjId,
    type: 'monthly_due',
    period: currentPeriod,
    status: 'open',
  }).lean();

  // Get all payments for current month
  const payments = await Payment.find({
    buildingId: buildingObjId,
    status: 'confirmed',
    paidAt: {
      $gte: startOfMonth,
      $lte: endOfMonth,
    },
  }).lean();

  // Get all special charges (non-monthly_due or monthly_due with different period)
  const specialCharges = await Charge.find({
    buildingId: buildingObjId,
    status: 'open',
    $or: [
      { type: { $ne: 'monthly_due' } },
      { type: 'monthly_due', period: { $ne: currentPeriod } },
    ],
  }).lean();

  // Create maps for efficient lookup
  const monthlyChargesMap = new Map(
    monthlyCharges.map((c) => [c.apartmentId.toString(), c.amount])
  );

  const paymentsMap = new Map<string, number>();
  for (const payment of payments) {
    const aptId = payment.apartmentId.toString();
    const current = paymentsMap.get(aptId) || 0;
    paymentsMap.set(aptId, current + payment.amount);
  }

  const specialChargesMap = new Map<string, number>();
  for (const charge of specialCharges) {
    const aptId = charge.apartmentId.toString();
    const current = specialChargesMap.get(aptId) || 0;
    specialChargesMap.set(aptId, current + charge.amount);
  }

  // Get all unique apartment IDs
  const allApartmentIds = new Set([
    ...monthlyChargesMap.keys(),
    ...paymentsMap.keys(),
    ...specialChargesMap.keys(),
  ]);

  // Calculate debt status for each apartment
  const debtStatuses = new Map<string, boolean>();
  for (const apartmentId of allApartmentIds) {
    const monthlyChargeAmount = monthlyChargesMap.get(apartmentId) || 0;
    const paidThisMonth = paymentsMap.get(apartmentId) || 0;
    const specialChargesAmount = specialChargesMap.get(apartmentId) || 0;

    // Has debt if monthly charge not fully paid or has special charges
    const hasDebt = monthlyChargeAmount > paidThisMonth || specialChargesAmount > 0;
    debtStatuses.set(apartmentId, hasDebt);
  }

  return debtStatuses;
}

// Get building-wide totals
export async function getBuildingTotals(buildingId: string) {
  const buildingObjId = new Types.ObjectId(buildingId);

  const [chargesTotal, paymentsTotal, pendingPayments] = await Promise.all([
    Charge.aggregate([
      { $match: { buildingId: buildingObjId, status: 'open' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Payment.aggregate([
      { $match: { buildingId: buildingObjId, status: 'confirmed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Payment.aggregate([
      { $match: { buildingId: buildingObjId, status: 'pending' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);

  return {
    totalOpenCharges: chargesTotal[0]?.total || 0,
    totalConfirmedPayments: paymentsTotal[0]?.total || 0,
    totalPendingPayments: pendingPayments[0]?.total || 0,
    outstandingBalance: (chargesTotal[0]?.total || 0) - (paymentsTotal[0]?.total || 0),
  };
}

