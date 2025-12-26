import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import { residentMoveInSchema } from '@/lib/validations';
import { canManageBuilding } from '@/lib/auth';
import Apartment from '@/models/Apartment';
import Resident from '@/models/Resident';
import { Types } from 'mongoose';

// POST /api/apartments/[id]/move-in - Move in a new resident to an apartment
export const POST = withAuth(async (request, { user, params }) => {
  // Only BOARD/MANAGEMENT can move in residents
  if (!canManageBuilding(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const apartmentId = params?.id;
  
  if (!apartmentId || !Types.ObjectId.isValid(apartmentId)) {
    return errorResponse('Invalid apartment ID');
  }

  const body = await request.json();
  const validation = residentMoveInSchema.safeParse(body);

  if (!validation.success) {
    return errorResponse(validation.error.errors[0].message);
  }

  // Verify apartment exists and belongs to same building
  const apartment = await Apartment.findOne({
    _id: new Types.ObjectId(apartmentId),
    buildingId: new Types.ObjectId(user.buildingId),
  });

  if (!apartment) {
    return errorResponse('Apartment not found', 404);
  }

  if (apartment.status === 'inactive') {
    return errorResponse('Cannot add residents to an inactive apartment', 400);
  }

  // Create new resident
  const moveInDate = validation.data.moveInAt || new Date();
  const resident = await Resident.create({
    buildingId: new Types.ObjectId(user.buildingId),
    apartmentId: new Types.ObjectId(apartmentId),
    fullName: validation.data.fullName,
    phone: validation.data.phone,
    email: validation.data.email,
    type: validation.data.type || 'owner',
    isActive: true,
    moveInAt: moveInDate,
    moveOutAt: null,
  });

  // Create audit log for move-in
  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'create',
    entityType: 'resident',
    entityId: resident._id.toString(),
    after: resident.toObject(),
    metadata: {
      action: 'move_in',
      apartmentId: apartmentId,
      apartmentNumber: apartment.number,
      moveInAt: moveInDate,
    },
  });

  return successResponse({
    message: 'Resident moved in successfully',
    resident: resident.toObject(),
  }, 201);
}, { requiredRole: 'RESIDENT' });

