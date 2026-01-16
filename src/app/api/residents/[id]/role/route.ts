import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import { canChangeRole } from '@/lib/auth';
import { UserRole } from '@/lib/types';
import Resident from '@/models/Resident';
import User from '@/models/User';
import { Types } from 'mongoose';
import { z } from 'zod';

const changeRoleSchema = z.object({
  newRole: z.enum(['ADMIN', 'BOARD', 'TREASURER', 'RESIDENT', 'MANAGEMENT']),
});

// POST /api/residents/[id]/role - Change resident's role
export const POST = withAuth(async (request, { user, params }) => {
  const id = params?.id;
  
  if (!id || !Types.ObjectId.isValid(id)) {
    return errorResponse('Invalid resident ID');
  }

  const body = await request.json();
  const validation = changeRoleSchema.safeParse(body);

  if (!validation.success) {
    return errorResponse('Invalid role');
  }

  const newRole = validation.data.newRole as UserRole;

  // Check if resident exists and belongs to same building
  const resident = await Resident.findOne({
    _id: new Types.ObjectId(id),
    buildingId: new Types.ObjectId(user.buildingId),
  });

  if (!resident) {
    return errorResponse('Resident not found', 404);
  }

  // Check if user exists for this resident
  const targetUser = await User.findOne({
    residentId: new Types.ObjectId(id),
    buildingId: new Types.ObjectId(user.buildingId),
  });

  if (!targetUser) {
    return errorResponse('למשתמש הנוכחי אין יוזר ולכן לא ניתן לרשום אותו - עליו ליצור יוזר', 400);
  }

  const targetUserRole = targetUser.role as UserRole;
  const isChangingSelf = targetUser._id.toString() === user.id;

  // Check if BOARD member is trying to change self and is only board member
  let isOnlyBoardMember = false;
  if (isChangingSelf && user.role === 'BOARD') {
    const boardMembersCount = await User.countDocuments({
      buildingId: new Types.ObjectId(user.buildingId),
      role: 'BOARD',
      isActive: true,
    });
    isOnlyBoardMember = boardMembersCount === 1;
  }

  // Check permissions
  if (!canChangeRole(user.role as UserRole, targetUserRole, newRole, isChangingSelf, isOnlyBoardMember)) {
    if (isChangingSelf && isOnlyBoardMember) {
      return errorResponse('על מנת לפרוש מהתפקיד עליך למנות חבר ועד במקומך היות ואתה חבר הוועד היחיד', 403);
    }
    return errorResponse('Permission denied', 403);
  }

  const before = {
    role: targetUser.role,
  };

  // Update role
  targetUser.role = newRole;
  await targetUser.save();

  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'update',
    entityType: 'user',
    entityId: targetUser._id.toString(),
    before,
    after: {
      role: targetUser.role,
    },
    metadata: {
      action: 'role_change',
      oldRole: targetUserRole,
      newRole,
    },
  });

  return successResponse({
    _id: targetUser._id.toString(),
    role: targetUser.role,
  });
});
