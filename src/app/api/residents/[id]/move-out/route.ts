import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import { residentMoveOutSchema } from '@/lib/validations';
import { canManageBuilding } from '@/lib/auth';
import Resident from '@/models/Resident';
import User from '@/models/User';
import { Types } from 'mongoose';

// POST /api/residents/[id]/move-out - Move out a resident
export const POST = withAuth(async (request, { user, params }) => {
  // Only BOARD/MANAGEMENT can move out residents
  if (!canManageBuilding(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const id = params?.id;
  
  if (!id || !Types.ObjectId.isValid(id)) {
    return errorResponse('Invalid resident ID');
  }

  const body = await request.json();
  const validation = residentMoveOutSchema.safeParse(body);

  if (!validation.success) {
    return errorResponse(validation.error.errors[0].message);
  }

  // Find resident in same building
  const resident = await Resident.findOne({
    _id: new Types.ObjectId(id),
    buildingId: new Types.ObjectId(user.buildingId),
  });

  if (!resident) {
    return errorResponse('Resident not found', 404);
  }

  // Check if already moved out
  if (!resident.isActive || resident.moveOutAt) {
    return errorResponse('Resident is already moved out', 400);
  }

  const before = resident.toObject();

  // Set move-out data
  const moveOutDate = validation.data.moveOutAt || new Date();
  resident.moveOutAt = moveOutDate;
  resident.isActive = false;
  if (validation.data.note) {
    resident.moveOutNote = validation.data.note;
  }

  await resident.save();

  // Disable associated user account if exists
  const linkedUser = await User.findOne({
    residentId: resident._id,
    buildingId: new Types.ObjectId(user.buildingId),
  });

  if (linkedUser) {
    linkedUser.isActive = false;
    await linkedUser.save();

    // Log user deactivation
    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'update',
      entityType: 'user',
      entityId: linkedUser._id.toString(),
      before: { isActive: true },
      after: { isActive: false },
      metadata: { reason: 'resident_move_out', residentId: resident._id.toString() },
    });
  }

  // Create audit log for resident move-out
  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'update',
    entityType: 'resident',
    entityId: resident._id.toString(),
    before,
    after: resident.toObject(),
    metadata: { 
      action: 'move_out',
      apartmentId: resident.apartmentId.toString(),
      moveOutAt: moveOutDate,
      note: validation.data.note,
      userDisabled: !!linkedUser,
    },
  });

  return successResponse({
    message: 'Resident moved out successfully',
    resident: resident.toObject(),
    userDisabled: !!linkedUser,
  });
}, { requiredRole: 'RESIDENT' });

