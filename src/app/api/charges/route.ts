import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, getPaginationParams, buildSortObject, createAuditLog } from '@/lib/api-utils';
import { chargeSchema, paginationSchema } from '@/lib/validations';
import { canManageFinances, canAccessApartment } from '@/lib/auth';
import Charge from '@/models/Charge';
import { Types } from 'mongoose';

// GET /api/charges - List charges for the building
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

  // Filter by period
  const period = searchParams.get('period');
  if (period) {
    query.period = period;
  }

  // Filter by type
  const type = searchParams.get('type');
  if (type) {
    query.type = type;
  }

  // For residents, only show their apartment charges
  if (user.role === 'RESIDENT' && user.apartmentId) {
    query.apartmentId = new Types.ObjectId(user.apartmentId);
  }

  const [charges, total] = await Promise.all([
    Charge.find(query)
      .populate('apartmentId', 'number floor')
      .populate('createdBy', 'name')
      .sort(buildSortObject(sortBy, sortOrder))
      .skip(skip)
      .limit(limit)
      .lean(),
    Charge.countDocuments(query),
  ]);

  return successResponse({
    data: charges,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// POST /api/charges - Create new charge
export const POST = withAuth(async (request, { user }) => {
  if (!canManageFinances(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const body = await request.json();
  const validation = chargeSchema.safeParse({
    ...body,
    buildingId: user.buildingId,
  });

  if (!validation.success) {
    return errorResponse(validation.error.errors[0].message);
  }

  // Check for duplicate monthly charge (idempotency)
  if (validation.data.type === 'monthly_due' && validation.data.period) {
    const existing = await Charge.findOne({
      buildingId: new Types.ObjectId(user.buildingId),
      apartmentId: new Types.ObjectId(validation.data.apartmentId),
      type: 'monthly_due',
      period: validation.data.period,
      status: 'open',
    });

    if (existing) {
      return errorResponse('Monthly charge already exists for this apartment and period', 409);
    }
  }

  const charge = await Charge.create({
    ...validation.data,
    buildingId: new Types.ObjectId(user.buildingId),
    apartmentId: new Types.ObjectId(validation.data.apartmentId),
    createdBy: new Types.ObjectId(user.id),
  });

  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'create',
    entityType: 'charge',
    entityId: charge._id.toString(),
    after: charge.toObject(),
  });

  return successResponse(charge, 201);
}, { requiredRole: 'RESIDENT' });

