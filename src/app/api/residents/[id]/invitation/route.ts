import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import Resident from '@/models/Resident';
import User from '@/models/User';
import { Types } from 'mongoose';
import { z } from 'zod';

const invitationResponseSchema = z.object({
  action: z.enum(['accept', 'reject']),
});

// POST /api/residents/[id]/invitation - Accept or reject invitation
export const POST = withAuth(async (request, { user, params }) => {
  const residentId = params?.id;

  if (!residentId || !Types.ObjectId.isValid(residentId)) {
    return errorResponse('Invalid resident ID');
  }

  const body = await request.json();
  const validation = invitationResponseSchema.safeParse(body);

  if (!validation.success) {
    return errorResponse(validation.error.errors[0].message);
  }

  const { action } = validation.data;

  // Find resident
  const resident = await Resident.findOne({
    _id: new Types.ObjectId(residentId),
    buildingId: new Types.ObjectId(user.buildingId),
    invitationStatus: 'pending',
  });

  if (!resident) {
    return errorResponse('Pending invitation not found', 404);
  }

  // For existing users, verify they are the invited user
  if (resident.email && resident.email !== user.email) {
    return errorResponse('Permission denied. This invitation is for a different user.', 403);
  }

  if (action === 'accept') {
    // Check existing active residents in this apartment (excluding pending invitations)
    const existingResidents = await Resident.find({
      apartmentId: resident.apartmentId,
      buildingId: new Types.ObjectId(user.buildingId),
      isActive: true,
      invitationStatus: { $ne: 'pending' },
      _id: { $ne: resident._id },
    });

    let isPrimaryContact = false;

    // If this is the only active resident (excluding pending), set as primary contact
    if (existingResidents.length === 0) {
      isPrimaryContact = true;
    } else {
      // If there are multiple residents, owner should be primary contact
      if (resident.type === 'owner') {
        // Remove primary contact from other residents
        await Resident.updateMany(
          {
            apartmentId: resident.apartmentId,
            buildingId: new Types.ObjectId(user.buildingId),
            isActive: true,
            isPrimaryContact: true,
            _id: { $ne: resident._id },
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

    // Update invitation status and primary contact
    resident.invitationStatus = 'accepted';
    resident.isPrimaryContact = isPrimaryContact;
    await resident.save();

    // Link user to resident if not already linked
    if (!user.residentId) {
      await User.findByIdAndUpdate(user.id, {
        residentId: resident._id,
      });
    } else if (user.residentId !== resident._id.toString()) {
      // User already has a different resident - update it
      await User.findByIdAndUpdate(user.id, {
        residentId: resident._id,
      });
    }

    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'update',
      entityType: 'resident',
      entityId: resident._id.toString(),
      before: { invitationStatus: 'pending' },
      after: { invitationStatus: 'accepted' },
      metadata: {
        action: 'accept_invitation',
        apartmentId: resident.apartmentId.toString(),
      },
    });

    return successResponse({
      message: 'Invitation accepted successfully',
      resident: resident.toObject(),
    });
  } else {
    // Reject invitation
    resident.invitationStatus = 'rejected';
    resident.rejectedAt = new Date();
    await resident.save();

    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'update',
      entityType: 'resident',
      entityId: resident._id.toString(),
      before: { invitationStatus: 'pending' },
      after: { invitationStatus: 'rejected', rejectedAt: new Date() },
      metadata: {
        action: 'reject_invitation',
        apartmentId: resident.apartmentId.toString(),
      },
    });

    return successResponse({
      message: 'Invitation rejected',
      resident: resident.toObject(),
    });
  }
});
