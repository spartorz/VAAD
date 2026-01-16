import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import { canManageApartmentResidents } from '@/lib/auth';
import Apartment from '@/models/Apartment';
import Resident from '@/models/Resident';
import { Types } from 'mongoose';
import { z } from 'zod';

const primaryContactSchema = z.object({
  residentId: z.string().min(1),
});

// POST /api/apartments/[id]/residents/primary-contact - Set primary contact
export const POST = withAuth(async (request, { user, params }) => {
  const apartmentId = params?.id;

  if (!apartmentId || !Types.ObjectId.isValid(apartmentId)) {
    return errorResponse('Invalid apartment ID');
  }

  // Check permissions - only apartment owner can set primary contact
  const canManage = await canManageApartmentResidents(user, apartmentId);
  if (!canManage) {
    return errorResponse('Permission denied. Only apartment owners can set primary contact.', 403);
  }

  const body = await request.json();
  const validation = primaryContactSchema.safeParse(body);

  if (!validation.success) {
    return errorResponse(validation.error.errors[0].message);
  }

  const { residentId } = validation.data;

  // Verify apartment exists
  const apartment = await Apartment.findOne({
    _id: new Types.ObjectId(apartmentId),
    buildingId: new Types.ObjectId(user.buildingId),
  });

  if (!apartment) {
    return errorResponse('Apartment not found', 404);
  }

  // Verify resident exists and belongs to this apartment
  const resident = await Resident.findOne({
    _id: new Types.ObjectId(residentId),
    apartmentId: new Types.ObjectId(apartmentId),
    buildingId: new Types.ObjectId(user.buildingId),
    isActive: true,
  });

  if (!resident) {
    return errorResponse('Resident not found or not active', 404);
  }

  // Check if invitation was accepted (if it was an invitation)
  if (resident.invitationStatus === 'pending') {
    return errorResponse('Cannot set primary contact for pending invitation', 400);
  }

  // Remove primary contact status from other residents in this apartment
  await Resident.updateMany(
    {
      apartmentId: new Types.ObjectId(apartmentId),
      buildingId: new Types.ObjectId(user.buildingId),
      isPrimaryContact: true,
      _id: { $ne: new Types.ObjectId(residentId) },
    },
    {
      $set: { isPrimaryContact: false },
    }
  );

  // Set this resident as primary contact
  const before = resident.toObject();
  resident.isPrimaryContact = true;
  await resident.save();

  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'update',
    entityType: 'resident',
    entityId: resident._id.toString(),
    before: { isPrimaryContact: before.isPrimaryContact },
    after: { isPrimaryContact: true },
    metadata: {
      action: 'set_primary_contact',
      apartmentId: apartmentId,
      apartmentNumber: apartment.number,
      residentName: resident.fullName,
    },
  });

  return successResponse({
    message: 'Primary contact set successfully',
    resident: resident.toObject(),
  });
});
