import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, getPaginationParams, buildSortObject, createAuditLog } from '@/lib/api-utils';
import { paymentSchema, paginationSchema } from '@/lib/validations';
import { canManageFinances, canAccessApartment } from '@/lib/auth';
import Payment from '@/models/Payment';
import { Types } from 'mongoose';

// GET /api/payments - List payments for the building
export const GET = withAuth(async (request, { user }) => {
  const { searchParams } = new URL(request.url);
  const params = getPaginationParams(request);
  const validation = paginationSchema.safeParse(params);
  
  if (!validation.success) {
    return errorResponse('Invalid pagination parameters');
  }

  const { page, limit, sortBy, sortOrder } = validation.data;
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = { buildingId: new Types.ObjectId(user.buildingId) };
  
  // Filter by apartment
  const apartmentId = searchParams.get('apartmentId');
  if (apartmentId && Types.ObjectId.isValid(apartmentId)) {
    query.apartmentId = new Types.ObjectId(apartmentId);
  }

  // Filter by status
  const status = searchParams.get('status');
  if (status) {
    query.status = status;
  }

  // Filter by method
  const method = searchParams.get('method');
  if (method) {
    query.method = method;
  }

  // Filter by date range
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  if (startDate || endDate) {
    query.paidAt = {};
    if (startDate) (query.paidAt as Record<string, Date>).$gte = new Date(startDate);
    if (endDate) (query.paidAt as Record<string, Date>).$lte = new Date(endDate);
  }

  // For residents, only show their apartment payments
  if (user.role === 'RESIDENT' && user.apartmentId) {
    query.apartmentId = new Types.ObjectId(user.apartmentId);
  }

  const [payments, total] = await Promise.all([
    Payment.find(query)
      .populate('apartmentId', 'number floor')
      .populate('residentId', 'fullName')
      .populate('createdBy', 'name')
      .sort(buildSortObject(sortBy === 'createdAt' ? 'paidAt' : sortBy, sortOrder))
      .skip(skip)
      .limit(limit)
      .lean(),
    Payment.countDocuments(query),
  ]);

  return successResponse({
    data: payments,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// POST /api/payments - Record new payment
export const POST = withAuth(async (request, { user }) => {
  if (!canManageFinances(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const body = await request.json();
  const validation = paymentSchema.safeParse({
    ...body,
    buildingId: user.buildingId,
  });

  if (!validation.success) {
    return errorResponse(validation.error.errors[0].message);
  }

  const payment = await Payment.create({
    ...validation.data,
    buildingId: new Types.ObjectId(user.buildingId),
    apartmentId: new Types.ObjectId(validation.data.apartmentId),
    residentId: validation.data.residentId ? new Types.ObjectId(validation.data.residentId) : undefined,
    createdBy: new Types.ObjectId(user.id),
  });

  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'create',
    entityType: 'payment',
    entityId: payment._id.toString(),
    after: payment.toObject(),
  });

  return successResponse(payment, 201);
}, { requiredRole: 'RESIDENT' });

