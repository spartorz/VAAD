import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, getPaginationParams, buildSortObject, createAuditLog } from '@/lib/api-utils';
import { residentSchema, paginationSchema } from '@/lib/validations';
import { canManageBuilding, canAccessApartment, canManageFinances } from '@/lib/auth';
import { calculateBuildingDebtStatuses } from '@/lib/balance';
import Resident from '@/models/Resident';
import User from '@/models/User';
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

  // Get user roles for all residents
  const residentIds = residents.map(r => r._id);
  const users = await User.find({
    buildingId: new Types.ObjectId(user.buildingId),
    residentId: { $in: residentIds },
  }).select('residentId role _id').lean();

  // Create a map of residentId -> user info
  const userMap = new Map<string, { role: string; userId: string }>();
  users.forEach(u => {
    if (u.residentId) {
      userMap.set(u.residentId.toString(), {
        role: u.role,
        userId: u._id.toString(),
      });
    }
  });

  // Add role and userId to each resident
  let residentsWithRoles = residents.map(resident => {
    const userInfo = userMap.get(resident._id.toString());
    return {
      ...resident,
      role: userInfo?.role || 'RESIDENT',
      userId: userInfo?.userId,
    };
  });

  // Add debt status for BOARD and TREASURER
  if (canManageFinances(user.role)) {
    const debtStatuses = await calculateBuildingDebtStatuses(user.buildingId);
    
    residentsWithRoles = residentsWithRoles.map(resident => {
      // Handle apartmentId which can be ObjectId or populated object
      let apartmentId: string;
      if (typeof resident.apartmentId === 'object' && resident.apartmentId !== null) {
        apartmentId = ('_id' in resident.apartmentId && resident.apartmentId._id)
          ? resident.apartmentId._id.toString()
          : resident.apartmentId.toString();
      } else {
        apartmentId = resident.apartmentId?.toString() || '';
      }
      const hasDebt = debtStatuses.get(apartmentId) || false;
      return {
        ...resident,
        hasDebt,
      };
    });
  }

  return successResponse({
    data: residentsWithRoles,
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

  const apartmentId = validation.data.apartmentId;
  
  // Check existing active residents in this apartment (excluding pending invitations)
  const existingResidents = await Resident.find({
    apartmentId: new Types.ObjectId(apartmentId),
    buildingId: new Types.ObjectId(user.buildingId),
    isActive: true,
    invitationStatus: { $ne: 'pending' },
  });

  const residentType = validation.data.type || 'owner';
  let isPrimaryContact = false;

  // If this is the only resident, set as primary contact
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

  const resident = await Resident.create({
    ...validation.data,
    buildingId: new Types.ObjectId(user.buildingId),
    apartmentId: new Types.ObjectId(apartmentId),
    isPrimaryContact,
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

