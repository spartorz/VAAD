import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import { apartmentUpdateSchema } from '@/lib/validations';
import { canManageBuilding, canAccessApartment } from '@/lib/auth';
import Apartment from '@/models/Apartment';
import { Types } from 'mongoose';

// GET /api/apartments/[id] - Get single apartment
export const GET = withAuth(async (request, { user, params }) => {
  const id = params?.id;
  
  if (!id || !Types.ObjectId.isValid(id)) {
    return errorResponse('Invalid apartment ID');
  }

  const apartment = await Apartment.findOne({
    _id: new Types.ObjectId(id),
    buildingId: new Types.ObjectId(user.buildingId),
  }).lean();

  if (!apartment) {
    return errorResponse('Apartment not found', 404);
  }

  // Check access for residents
  if (!canAccessApartment(user, id)) {
    return errorResponse('Permission denied', 403);
  }

  return successResponse(apartment);
});

// PATCH /api/apartments/[id] - Update apartment
export const PATCH = withAuth(async (request, { user, params }) => {
  if (!canManageBuilding(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const id = params?.id;
  
  if (!id || !Types.ObjectId.isValid(id)) {
    return errorResponse('Invalid apartment ID');
  }

  const body = await request.json();
  const validation = apartmentUpdateSchema.safeParse(body);

  if (!validation.success) {
    return errorResponse(validation.error.errors[0].message);
  }

  const apartment = await Apartment.findOne({
    _id: new Types.ObjectId(id),
    buildingId: new Types.ObjectId(user.buildingId),
  });

  if (!apartment) {
    return errorResponse('Apartment not found', 404);
  }

  const before = apartment.toObject();

  // Check for duplicate number if changing
  if (validation.data.number && validation.data.number !== apartment.number) {
    const existing = await Apartment.findOne({
      buildingId: new Types.ObjectId(user.buildingId),
      number: validation.data.number,
      _id: { $ne: apartment._id },
    });

    if (existing) {
      return errorResponse('Apartment number already exists', 409);
    }
  }

  Object.assign(apartment, validation.data);
  await apartment.save();

  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'update',
    entityType: 'apartment',
    entityId: apartment._id.toString(),
    before,
    after: apartment.toObject(),
  });

  return successResponse(apartment);
});

// DELETE /api/apartments/[id] - Delete apartment (soft delete by setting inactive)
export const DELETE = withAuth(async (request, { user, params }) => {
  if (!canManageBuilding(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const id = params?.id;
  
  if (!id || !Types.ObjectId.isValid(id)) {
    return errorResponse('Invalid apartment ID');
  }

  const apartment = await Apartment.findOne({
    _id: new Types.ObjectId(id),
    buildingId: new Types.ObjectId(user.buildingId),
  });

  if (!apartment) {
    return errorResponse('Apartment not found', 404);
  }

  const before = apartment.toObject();
  apartment.status = 'inactive';
  await apartment.save();

  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'update',
    entityType: 'apartment',
    entityId: apartment._id.toString(),
    before,
    after: apartment.toObject(),
  });

  return successResponse({ message: 'Apartment deactivated' });
});

