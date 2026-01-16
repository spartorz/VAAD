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

  // Check existing active residents in this apartment (excluding pending invitations)
  const existingResidents = await Resident.find({
    apartmentId: new Types.ObjectId(apartmentId),
    buildingId: new Types.ObjectId(user.buildingId),
    isActive: true,
    invitationStatus: { $ne: 'pending' },
  });

  const residentType = validation.data.type || 'owner';
  let isPrimaryContact = false;

  // If this is the only active resident (excluding pending), set as primary contact
  if (existingResidents.length === 0) {
    isPrimaryContact = true;
  } else {
    // If there are multiple residents, owner should be primary contact
    if (residentType === 'owner') {
      // Remove primary contact from other residents
      await Resident.updateMany(
        {
          apartmentId: new Types.ObjectId(apartmentId),
          buildingId: new Types.ObjectId(user.buildingId),
          isActive: true,
          isPrimaryContact: true,
        },
        {
          $set: { isPrimaryContact: false },
        }
      );
      isPrimaryContact = true;
    } else {
      // If tenant and no owner is primary contact, find owner and set as primary
      const ownerPrimaryContact = existingResidents.find(r => r.type === 'owner' && r.isPrimaryContact);
      if (!ownerPrimaryContact) {
        const owner = existingResidents.find(r => r.type === 'owner');
        if (owner) {
          await Resident.updateOne(
            { _id: owner._id },
            { $set: { isPrimaryContact: true } }
          );
        }
      }
    }
  }

  // Create new resident
  const moveInDate = validation.data.moveInAt || new Date();
  const resident = await Resident.create({
    buildingId: new Types.ObjectId(user.buildingId),
    apartmentId: new Types.ObjectId(apartmentId),
    fullName: validation.data.fullName,
    phone: validation.data.phone,
    email: validation.data.email,
    type: residentType,
    isActive: true,
    moveInAt: moveInDate,
    moveOutAt: null,
    isPrimaryContact,
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

