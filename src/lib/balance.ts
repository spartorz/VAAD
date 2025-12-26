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

