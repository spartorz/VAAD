import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, getPaginationParams, buildSortObject, createAuditLog } from '@/lib/api-utils';
import { apartmentSchema, paginationSchema } from '@/lib/validations';
import { canManageBuilding } from '@/lib/auth';
import Apartment from '@/models/Apartment';
import { Types } from 'mongoose';

// GET /api/apartments - List apartments for the building
export const GET = withAuth(async (request, { user }) => {
  const params = getPaginationParams(request);
  const validation = paginationSchema.safeParse(params);
  
  if (!validation.success) {
    return errorResponse('Invalid pagination parameters');
  }

  const { page, limit, search, sortBy, sortOrder } = validation.data;
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = { buildingId: new Types.ObjectId(user.buildingId) };
  
  // Search by apartment number
  if (search) {
    query.number = { $regex: search, $options: 'i' };
  }

  // For residents, only show their own apartment
  if (user.role === 'RESIDENT' && user.apartmentId) {
    query._id = new Types.ObjectId(user.apartmentId);
  }

  const [apartments, total] = await Promise.all([
    Apartment.find(query)
      .sort(buildSortObject(sortBy, sortOrder))
      .skip(skip)
      .limit(limit)
      .lean(),
    Apartment.countDocuments(query),
  ]);

  return successResponse({
    data: apartments,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// POST /api/apartments - Create new apartment
export const POST = withAuth(async (request, { user }) => {
  if (!canManageBuilding(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const body = await request.json();
  const validation = apartmentSchema.safeParse({
    ...body,
    buildingId: user.buildingId,
  });

  if (!validation.success) {
    return errorResponse(validation.error.errors[0].message);
  }

  // Check for duplicate apartment number
  const existing = await Apartment.findOne({
    buildingId: new Types.ObjectId(user.buildingId),
    number: validation.data.number,
  });

  if (existing) {
    return errorResponse('Apartment number already exists', 409);
  }

  const apartment = await Apartment.create({
    ...validation.data,
    buildingId: new Types.ObjectId(user.buildingId),
  });

  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'create',
    entityType: 'apartment',
    entityId: apartment._id.toString(),
    after: apartment.toObject(),
  });

  return successResponse(apartment, 201);
}, { requiredRole: 'RESIDENT' });

