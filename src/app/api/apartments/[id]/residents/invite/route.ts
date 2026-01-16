import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import { canManageApartmentResidents } from '@/lib/auth';
import Apartment from '@/models/Apartment';
import Resident from '@/models/Resident';
import User from '@/models/User';
import { Types } from 'mongoose';
import { z } from 'zod';
import crypto from 'crypto';

const inviteSchema = z.object({
  type: z.enum(['existing', 'new']),
  // For existing user
  userId: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  // For new user
  fullName: z.string().min(1).optional(),
  // Common
  residentType: z.enum(['owner', 'tenant']).default('tenant'),
});

// POST /api/apartments/[id]/residents/invite - Invite a resident (existing user or new)
export const POST = withAuth(async (request, { user, params }) => {
  const apartmentId = params?.id;

  if (!apartmentId || !Types.ObjectId.isValid(apartmentId)) {
    return errorResponse('Invalid apartment ID');
  }

  // Check permissions - only apartment owner can invite
  const canManage = await canManageApartmentResidents(user, apartmentId);
  if (!canManage) {
    return errorResponse('Permission denied. Only apartment owners can invite residents.', 403);
  }

  const body = await request.json();
  const validation = inviteSchema.safeParse(body);

  if (!validation.success) {
    return errorResponse(validation.error.errors[0].message);
  }

  const { type, userId, email, phone, fullName, residentType } = validation.data;

  // Check if user is a resident (not owner) - they can only add tenants
  if (user.role === 'RESIDENT' && residentType === 'owner') {
    return errorResponse('Residents can only add tenants, not owners.', 403);
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

  // Generate invitation token for new users
  const invitationToken = type === 'new' ? crypto.randomBytes(32).toString('hex') : undefined;

  if (type === 'existing') {
    // Invite existing user
    if (!userId && !email && !phone) {
      return errorResponse('userId, email, or phone is required for existing users');
    }

    let existingUser: any = null;
    if (userId) {
      existingUser = await User.findOne({
        _id: new Types.ObjectId(userId),
        buildingId: new Types.ObjectId(user.buildingId),
      });
    } else if (email) {
      existingUser = await User.findOne({
        email: email.toLowerCase(),
        buildingId: new Types.ObjectId(user.buildingId),
      });
    } else if (phone) {
      // Find user by phone through resident
      const residentWithPhone = await Resident.findOne({
        buildingId: new Types.ObjectId(user.buildingId),
        phone: phone,
        isActive: true,
      }).populate('apartmentId');
      
      if (residentWithPhone) {
        existingUser = await User.findOne({
          residentId: residentWithPhone._id,
          buildingId: new Types.ObjectId(user.buildingId),
        });
      }
    }

    if (!existingUser) {
      return errorResponse('User not found', 404);
    }

    // Check if resident already exists for this apartment
    const existingResident = await Resident.findOne({
      buildingId: new Types.ObjectId(user.buildingId),
      apartmentId: new Types.ObjectId(apartmentId),
      $or: [
        { email: existingUser.email },
        { _id: existingUser.residentId },
      ],
      isActive: true,
    });

    if (existingResident) {
      return errorResponse('Resident already exists for this apartment', 409);
    }

    // Create resident with pending invitation
    const resident = await Resident.create({
      buildingId: new Types.ObjectId(user.buildingId),
      apartmentId: new Types.ObjectId(apartmentId),
      fullName: existingUser.name,
      email: existingUser.email,
      type: residentType,
      isActive: true,
      moveInAt: new Date(),
      moveOutAt: null,
      invitationStatus: 'pending',
      invitedBy: new Types.ObjectId(user.id),
      invitedAt: new Date(),
    });

    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'create',
      entityType: 'resident',
      entityId: resident._id.toString(),
      after: resident.toObject(),
      metadata: {
        action: 'invite_existing_user',
        apartmentId: apartmentId,
        apartmentNumber: apartment.number,
        invitedUserId: existingUser._id.toString(),
      },
    });

    return successResponse({
      message: 'Invitation sent successfully',
      resident: resident.toObject(),
      invitationStatus: 'pending',
    }, 201);
  } else {
    // Invite new user
    if (!fullName || (!email && !phone)) {
      return errorResponse('fullName and email or phone are required for new users');
    }

    // Check if resident already exists
    const existingResident = await Resident.findOne({
      buildingId: new Types.ObjectId(user.buildingId),
      apartmentId: new Types.ObjectId(apartmentId),
      $or: [
        ...(email ? [{ email: email.toLowerCase() }] : []),
        ...(phone ? [{ phone: phone }] : []),
      ],
      isActive: true,
    });

    if (existingResident) {
      return errorResponse('Resident already exists for this apartment', 409);
    }

    // Create resident with pending invitation and token
    const resident = await Resident.create({
      buildingId: new Types.ObjectId(user.buildingId),
      apartmentId: new Types.ObjectId(apartmentId),
      fullName: fullName,
      email: email?.toLowerCase(),
      phone: phone,
      type: residentType,
      isActive: true,
      moveInAt: new Date(),
      moveOutAt: null,
      invitationStatus: 'pending',
      invitedBy: new Types.ObjectId(user.id),
      invitedAt: new Date(),
      invitationToken: invitationToken,
    });

    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'create',
      entityType: 'resident',
      entityId: resident._id.toString(),
      after: resident.toObject(),
      metadata: {
        action: 'invite_new_user',
        apartmentId: apartmentId,
        apartmentNumber: apartment.number,
        invitationToken: invitationToken,
      },
    });

    // TODO: Send invitation email/SMS with registration link
    // const registrationLink = `${process.env.NEXTAUTH_URL}/register?token=${invitationToken}&apartmentId=${apartmentId}`;

    return successResponse({
      message: 'Invitation sent successfully',
      resident: resident.toObject(),
      invitationStatus: 'pending',
      invitationToken: invitationToken,
      // registrationLink: registrationLink, // For frontend to display
    }, 201);
  }
});
