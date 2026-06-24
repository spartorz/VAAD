import { Types } from 'mongoose';
import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { canManageBuilding } from '@/lib/auth';
import Vendor from '@/models/Vendor';
import MaintenanceTicket from '@/models/MaintenanceTicket';

// GET /api/vendors/[id]/performance
export const GET = withAuth(async (request, { user, params }) => {
  if (!canManageBuilding(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const vendorId = params?.id;
  if (!vendorId || !Types.ObjectId.isValid(vendorId)) {
    return errorResponse('Invalid vendor ID', 400);
  }

  const vendor = await Vendor.findOne({
    _id: new Types.ObjectId(vendorId),
    buildingId: new Types.ObjectId(user.buildingId),
  }).lean();
  if (!vendor) return errorResponse('Vendor not found', 404);

  const query: Record<string, unknown> = {
    buildingId: new Types.ObjectId(user.buildingId),
    vendorId: new Types.ObjectId(vendorId),
  };

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  if (from || to) {
    const dateQuery: Record<string, Date> = {};
    if (from) dateQuery.$gte = new Date(from);
    if (to) dateQuery.$lte = new Date(to);
    query.createdAt = dateQuery;
  }

  const [assignedCount, openCount, closedCount, resolutionAgg, breachCount, invoiceAgg, recentInvoices] = await Promise.all([
    MaintenanceTicket.countDocuments(query),
    MaintenanceTicket.countDocuments({
      ...query,
      status: { $nin: ['closed'] },
    }),
    MaintenanceTicket.countDocuments({
      ...query,
      status: 'closed',
    }),
    MaintenanceTicket.aggregate([
      {
        $match: {
          ...query,
          closedAt: { $exists: true, $ne: null },
        },
      },
      {
        $project: {
          durationMs: { $subtract: ['$closedAt', '$createdAt'] },
        },
      },
      {
        $group: {
          _id: null,
          avgDurationMs: { $avg: '$durationMs' },
        },
      },
    ]),
    MaintenanceTicket.countDocuments({
      ...query,
      slaBreached: true,
    }),
    MaintenanceTicket.aggregate([
      {
        $match: {
          ...query,
          invoiceDocumentId: { $exists: true, $ne: null },
          costAmount: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: null,
          totalInvoicedAmount: { $sum: '$costAmount' },
          invoicesCount: { $sum: 1 },
        },
      },
    ]),
    MaintenanceTicket.find({
      ...query,
      invoiceDocumentId: { $exists: true, $ne: null },
    })
      .select('_id title invoiceNumber invoiceDate costAmount costCurrency closedAt')
      .sort({ closedAt: -1, updatedAt: -1 })
      .limit(5)
      .lean(),
  ]);

  const avgResolutionMs = resolutionAgg[0]?.avgDurationMs || 0;
  const avgResolutionHours = avgResolutionMs > 0 ? Number((avgResolutionMs / (1000 * 60 * 60)).toFixed(2)) : 0;
  const breachRate = assignedCount > 0 ? Number(((breachCount / assignedCount) * 100).toFixed(1)) : 0;
  const totalInvoicedAmount = Number(invoiceAgg[0]?.totalInvoicedAmount || 0);
  const invoicesCount = Number(invoiceAgg[0]?.invoicesCount || 0);

  return successResponse({
    vendor: {
      _id: vendor._id.toString(),
      name: vendor.name,
      category: vendor.category,
      isActive: vendor.isActive !== false,
    },
    metrics: {
      assignedCount,
      openCount,
      closedCount,
      avgResolutionHours,
      slaBreachCount: breachCount,
      slaBreachRate: breachRate,
      totalInvoicedAmount,
      invoicesCount,
    },
    recentInvoices: recentInvoices.map((ticket) => ({
      ticketId: ticket._id.toString(),
      ticketTitle: ticket.title,
      invoiceNumber: ticket.invoiceNumber || null,
      invoiceDate: ticket.invoiceDate || null,
      amount: ticket.costAmount || null,
      currency: ticket.costCurrency || 'ILS',
      closedAt: ticket.closedAt || null,
    })),
  });
});
