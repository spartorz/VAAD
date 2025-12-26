import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, getPaginationParams, buildSortObject, createAuditLog } from '@/lib/api-utils';
import { residentSchema, paginationSchema } from '@/lib/validations';
import { canManageBuilding, canAccessApartment } from '@/lib/auth';
import Resident from '@/models/Resident';
import { Types } from 'mongoose';

// GET /api/residents - List residents for the building
export const GET = withAuth(async (request, { user }) => {
  const { searchParams } = new URL(request.url);
  const params = getPaginationParams(request);
  const validation = paginationSchema.safeParse(params);
  
  if (!validation.success) {
    return errorResponse('Invalid pagination parameters');
  }

  const { page, limit, search, sortBy, sortOrder } = validation.data;
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = { buildingId: new Types.ObjectId(user.buildingId) };
  
  // Filter by apartment
  const apartmentId = searchParams.get('apartmentId');
  if (apartmentId && Types.ObjectId.isValid(apartmentId)) {
    query.apartmentId = new Types.ObjectId(apartmentId);
  }

  // Filter by active status
  const isActive = searchParams.get('isActive');
  if (isActive !== null) {
    query.isActive = isActive === 'true';
  }

  // Search by name, email, phone
  if (search) {
    query.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ];
  }

  // For residents, only show residents in their apartment
  if (user.role === 'RESIDENT' && user.apartmentId) {
    query.apartmentId = new Types.ObjectId(user.apartmentId);
  }

  const [residents, total] = await Promise.all([
    Resident.find(query)
      .populate('apartmentId', 'number floor')
      .sort(buildSortObject(sortBy, sortOrder))
      .skip(skip)
      .limit(limit)
      .lean(),
    Resident.countDocuments(query),
  ]);

  return successResponse({
    data: residents,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// POST /api/residents - Create new resident
export const POST = withAuth(async (request, { user }) => {
  if (!canManageBuilding(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const body = await request.json();
  const validation = residentSchema.safeParse({
    ...body,
    buildingId: user.buildingId,
  });

  if (!validation.success) {
    return errorResponse(validation.error.errors[0].message);
  }

  const resident = await Resident.create({
    ...validation.data,
    buildingId: new Types.ObjectId(user.buildingId),
    apartmentId: new Types.ObjectId(validation.data.apartmentId),
  });

  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'create',
    entityType: 'resident',
    entityId: resident._id.toString(),
    after: resident.toObject(),
  });

  return successResponse(resident, 201);
}, { requiredRole: 'RESIDENT' });

