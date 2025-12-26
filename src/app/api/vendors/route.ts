import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, getPaginationParams, buildSortObject, createAuditLog } from '@/lib/api-utils';
import { vendorSchema, paginationSchema } from '@/lib/validations';
import { canManageBuilding } from '@/lib/auth';
import Vendor from '@/models/Vendor';
import { Types } from 'mongoose';

// GET /api/vendors - List vendors for the building
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
  
  // Filter by category
  const category = searchParams.get('category');
  if (category) {
    query.category = category;
  }

  // Search by name
  if (search) {
    query.name = { $regex: search, $options: 'i' };
  }

  const [vendors, total] = await Promise.all([
    Vendor.find(query)
      .sort(buildSortObject(sortBy, sortOrder))
      .skip(skip)
      .limit(limit)
      .lean(),
    Vendor.countDocuments(query),
  ]);

  return successResponse({
    data: vendors,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// POST /api/vendors - Create new vendor
export const POST = withAuth(async (request, { user }) => {
  if (!canManageBuilding(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const body = await request.json();
  const validation = vendorSchema.safeParse({
    ...body,
    buildingId: user.buildingId,
  });

  if (!validation.success) {
    return errorResponse(validation.error.errors[0].message);
  }

  const vendor = await Vendor.create({
    ...validation.data,
    buildingId: new Types.ObjectId(user.buildingId),
  });

  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'create',
    entityType: 'vendor',
    entityId: vendor._id.toString(),
    after: vendor.toObject(),
  });

  return successResponse(vendor, 201);
}, { requiredRole: 'RESIDENT' });

