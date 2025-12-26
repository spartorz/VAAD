import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { canManageBuilding, canManageFinances } from '@/lib/auth';
import { calculateApartmentBalance, getBuildingTotals } from '@/lib/balance';
import Apartment from '@/models/Apartment';
import MaintenanceTicket from '@/models/MaintenanceTicket';
import Payment from '@/models/Payment';
import Charge from '@/models/Charge';
import AuditLog from '@/models/AuditLog';
import { Types } from 'mongoose';

// GET /api/dashboard - Get dashboard data based on role
export const GET = withAuth(async (request, { user }) => {
  const buildingId = new Types.ObjectId(user.buildingId);

  // For residents, show their own apartment data
  if (user.role === 'RESIDENT') {
    if (!user.apartmentId) {
      return successResponse({
        type: 'resident',
        message: 'No apartment assigned',
      });
    }

    const [balance, myTickets, apartment] = await Promise.all([
      calculateApartmentBalance(user.buildingId, user.apartmentId),
      MaintenanceTicket.find({
        buildingId,
        $or: [
          { apartmentId: new Types.ObjectId(user.apartmentId) },
          { createdBy: new Types.ObjectId(user.id) },
        ],
        status: { $nin: ['closed'] },
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Apartment.findById(user.apartmentId).lean(),
    ]);

    return successResponse({
      type: 'resident',
      apartment: {
        _id: apartment?._id,
        number: apartment?.number,
        floor: apartment?.floor,
      },
      balance,
      recentTickets: myTickets,
    });
  }

  // For Board/Treasurer/Management - show building-wide stats
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const [
    buildingTotals,
    apartmentCount,
    openTickets,
    urgentTickets,
    paymentsThisMonth,
    recentActivity,
    ticketsByStatus,
  ] = await Promise.all([
    getBuildingTotals(user.buildingId),
    Apartment.countDocuments({ buildingId, status: 'active' }),
    MaintenanceTicket.countDocuments({ 
      buildingId, 
      status: { $nin: ['resolved', 'closed'] } 
    }),
    MaintenanceTicket.countDocuments({ 
      buildingId, 
      priority: 'urgent',
      status: { $nin: ['resolved', 'closed'] } 
    }),
    Payment.aggregate([
      {
        $match: {
          buildingId,
          status: 'confirmed',
          paidAt: { $gte: startOfMonth, $lte: endOfMonth },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]),
    AuditLog.find({ buildingId })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('actorUserId', 'name')
      .lean(),
    MaintenanceTicket.aggregate([
      { $match: { buildingId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const ticketStats = ticketsByStatus.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {} as Record<string, number>);

  return successResponse({
    type: 'management',
    overview: {
      totalApartments: apartmentCount,
      outstandingBalance: buildingTotals.outstandingBalance,
      totalOpenCharges: buildingTotals.totalOpenCharges,
      totalConfirmedPayments: buildingTotals.totalConfirmedPayments,
    },
    tickets: {
      open: openTickets,
      urgent: urgentTickets,
      byStatus: ticketStats,
    },
    paymentsThisMonth: {
      total: paymentsThisMonth[0]?.total || 0,
      count: paymentsThisMonth[0]?.count || 0,
    },
    recentActivity: recentActivity.map((log) => ({
      _id: log._id,
      action: log.action,
      entityType: log.entityType,
      actorName: log.actorName || (log.actorUserId as any)?.name || 'Unknown',
      createdAt: log.createdAt,
    })),
  });
});

