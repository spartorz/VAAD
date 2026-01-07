import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { canManageFinances } from '@/lib/auth';
import Charge from '@/models/Charge';
import Payment from '@/models/Payment';
import Apartment from '@/models/Apartment';
import Building from '@/models/Building';
import Resident from '@/models/Resident';
import { Types } from 'mongoose';

interface ResidentInfo {
  _id: string;
  fullName: string;
  phone?: string;
  email?: string;
  type: 'owner' | 'tenant';
}

interface ApartmentBillingSummary {
  apartmentId: string;
  apartmentNumber: string;
  floor?: number;
  monthlyDue: number;
  chargeId?: string;
  paidThisMonth: number;
  remaining: number;
  status: 'paid' | 'partial' | 'unpaid' | 'no_charge';
  residents?: ResidentInfo[];
  payments: Array<{
    _id: string;
    amount: number;
    method: string;
    paidAt: string;
    reference?: string;
  }>;
}

// GET /api/billing/monthly - Get monthly billing summary for all apartments
export const GET = withAuth(async (request, { user }) => {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period');
  const includeResidents = searchParams.get('includeResidents') === 'true';

  // Validate period format (YYYY-MM)
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return errorResponse('Invalid period format. Use YYYY-MM');
  }

  const buildingId = new Types.ObjectId(user.buildingId);

  // Get building for default monthly amount and currency
  const building = await Building.findById(buildingId).lean();
  if (!building) {
    return errorResponse('Building not found', 404);
  }

  const currency = building.settings?.currency || 'ILS';
  const defaultMonthlyAmount = building.settings?.monthlyDueAmount || 0;

  // Get all active apartments in the building
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

  // Create a map of apartmentId -> charge
  const chargeMap = new Map(
    charges.map((c) => [c.apartmentId.toString(), c])
  );

  // Calculate date range for the period (payments made in that month)
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

  // Create a map of apartmentId -> payments array
  const paymentsMap = new Map<string, typeof payments>();
  for (const payment of payments) {
    const aptId = payment.apartmentId.toString();
    if (!paymentsMap.has(aptId)) {
      paymentsMap.set(aptId, []);
    }
    paymentsMap.get(aptId)!.push(payment);
  }

  // Optionally fetch residents for all apartments
  let residentsMap = new Map<string, ResidentInfo[]>();
  if (includeResidents) {
    const residents = await Resident.find({
      buildingId,
      isActive: true,
    }).lean();
    
    for (const resident of residents) {
      const aptId = resident.apartmentId.toString();
      if (!residentsMap.has(aptId)) {
        residentsMap.set(aptId, []);
      }
      residentsMap.get(aptId)!.push({
        _id: resident._id.toString(),
        fullName: resident.fullName,
        phone: resident.phone,
        email: resident.email,
        type: resident.type as 'owner' | 'tenant',
      });
    }
  }

  // Build summary for each apartment
  const summaries: ApartmentBillingSummary[] = apartments.map((apt) => {
    const aptId = apt._id.toString();
    const charge = chargeMap.get(aptId);
    const aptPayments = paymentsMap.get(aptId) || [];
    
    const monthlyDue = charge?.amount ?? 0;
    const paidThisMonth = aptPayments.reduce((sum, p) => sum + p.amount, 0);
    const remaining = Math.max(0, monthlyDue - paidThisMonth);

    let status: ApartmentBillingSummary['status'];
    if (!charge) {
      status = 'no_charge';
    } else if (remaining <= 0) {
      status = 'paid';
    } else if (paidThisMonth > 0) {
      status = 'partial';
    } else {
      status = 'unpaid';
    }

    const summary: ApartmentBillingSummary = {
      apartmentId: aptId,
      apartmentNumber: apt.number,
      floor: apt.floor,
      monthlyDue,
      chargeId: charge?._id.toString(),
      paidThisMonth,
      remaining,
      status,
      payments: aptPayments.map((p) => ({
        _id: p._id.toString(),
        amount: p.amount,
        method: p.method,
        paidAt: p.paidAt.toISOString(),
        reference: p.reference,
      })),
    };

    // Add residents if requested
    if (includeResidents) {
      summary.residents = residentsMap.get(aptId) || [];
    }

    return summary;
  });

  // Calculate totals
  const totalDue = summaries.reduce((sum, s) => sum + s.monthlyDue, 0);
  const totalPaid = summaries.reduce((sum, s) => sum + s.paidThisMonth, 0);
  const totalRemaining = summaries.reduce((sum, s) => sum + s.remaining, 0);
  const paidCount = summaries.filter((s) => s.status === 'paid').length;
  const partialCount = summaries.filter((s) => s.status === 'partial').length;
  const unpaidCount = summaries.filter((s) => s.status === 'unpaid').length;
  const noChargeCount = summaries.filter((s) => s.status === 'no_charge').length;

  return successResponse({
    period,
    currency,
    defaultMonthlyAmount,
    buildingName: building.name || '',
    summary: {
      totalApartments: apartments.length,
      totalDue,
      totalPaid,
      totalRemaining,
      paidCount,
      partialCount,
      unpaidCount,
      noChargeCount,
    },
    apartments: summaries,
  });
}, { requiredRole: 'RESIDENT' });

