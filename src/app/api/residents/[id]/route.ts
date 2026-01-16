import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import { residentUpdateSchema } from '@/lib/validations';
import { canManageBuilding, canAccessApartment } from '@/lib/auth';
import Resident from '@/models/Resident';
import User from '@/models/User';
import { Types } from 'mongoose';

// GET /api/residents/[id] - Get single resident
export const GET = withAuth(async (request, { user, params }) => {
  const id = params?.id;
  
  if (!id || !Types.ObjectId.isValid(id)) {
    return errorResponse('Invalid resident ID');
  }

  const resident = await Resident.findOne({
    _id: new Types.ObjectId(id),
    buildingId: new Types.ObjectId(user.buildingId),
  })
    .populate('apartmentId', 'number floor')
    .lean();

  if (!resident) {
    return errorResponse('Resident not found', 404);
  }

  // Check access for residents
  if (user.role === 'RESIDENT' && !canAccessApartment(user, resident.apartmentId.toString())) {
    return errorResponse('Permission denied', 403);
  }

  return successResponse(resident);
});

// PATCH /api/residents/[id] - Update resident
export const PATCH = withAuth(async (request, { user, params }) => {
  // Check permissions
  if (!canManageBuilding(user.role)) {
    // For residents, check if they invited this resident
    if (user.role === 'RESIDENT') {
      const resident = await Resident.findOne({
        _id: new Types.ObjectId(params?.id || ''),
        buildingId: new Types.ObjectId(user.buildingId),
      });

      if (!resident || resident.invitedBy?.toString() !== user.id) {
        return errorResponse('You can only edit residents you invited.', 403);
      }
    } else {
      return errorResponse('Permission denied', 403);
    }
  }

  const id = params?.id;
  
  if (!id || !Types.ObjectId.isValid(id)) {
    return errorResponse('Invalid resident ID');
  }

  const body = await request.json();
  const validation = residentUpdateSchema.safeParse(body);

  if (!validation.success) {
    return errorResponse(validation.error.errors[0].message);
  }

  const resident = await Resident.findOne({
    _id: new Types.ObjectId(id),
    buildingId: new Types.ObjectId(user.buildingId),
  });

  if (!resident) {
    return errorResponse('Resident not found', 404);
  }

  const before = resident.toObject();

  // Check if trying to change apartmentId
  if (validation.data.apartmentId && 
      validation.data.apartmentId !== resident.apartmentId.toString()) {
    // Check if this resident has a linked user account
    const linkedUser = await User.findOne({
      residentId: resident._id,
      buildingId: new Types.ObjectId(user.buildingId),
    });
    
    if (linkedUser) {
      return errorResponse(
        'Cannot change apartment for a resident with an active user account. Use the move-out/move-in flow instead.',
        400
      );
    }
    
    // No linked user, allow the change
    resident.apartmentId = new Types.ObjectId(validation.data.apartmentId);
  }
  
  // Update other fields (only contact info and type for safety)
  if (validation.data.fullName !== undefined) resident.fullName = validation.data.fullName;
  if (validation.data.email !== undefined) resident.email = validation.data.email;
  if (validation.data.phone !== undefined) resident.phone = validation.data.phone;
  if (validation.data.type !== undefined) resident.type = validation.data.type;
  
  await resident.save();

  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'update',
    entityType: 'resident',
    entityId: resident._id.toString(),
    before,
    after: resident.toObject(),
  });

  return successResponse(resident);
});

// DELETE /api/residents/[id] - Deactivate resident (soft delete / move-out)
export const DELETE = withAuth(async (request, { user, params }) => {
  if (!canManageBuilding(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const id = params?.id;
  
  if (!id || !Types.ObjectId.isValid(id)) {
    return errorResponse('Invalid resident ID');
  }

  const resident = await Resident.findOne({
    _id: new Types.ObjectId(id),
    buildingId: new Types.ObjectId(user.buildingId),
  });

  if (!resident) {
    return errorResponse('Resident not found', 404);
  }

  // If already inactive, nothing to do
  if (!resident.isActive) {
    return successResponse({ message: 'Resident already deactivated' });
  }

  const before = resident.toObject();
  
  // Set move-out data for consistency
  resident.isActive = false;
  if (!resident.moveOutAt) {
    resident.moveOutAt = new Date();
  }
  
  await resident.save();

  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'update',
    entityType: 'resident',
    entityId: resident._id.toString(),
    before,
    after: resident.toObject(),
    metadata: { action: 'deactivate' },
  });

  return successResponse({ message: 'Resident deactivated' });
});

