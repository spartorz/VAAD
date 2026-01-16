import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import { canManageBuilding } from '@/lib/auth';
import Resident from '@/models/Resident';
import User from '@/models/User';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { z } from 'zod';

const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// POST /api/residents/[id]/user - Create user account for a resident
export const POST = withAuth(async (request, { user, params }) => {
  if (!canManageBuilding(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const id = params?.id;
  
  if (!id || !Types.ObjectId.isValid(id)) {
    return errorResponse('Invalid resident ID');
  }

  const body = await request.json();
  const validation = createUserSchema.safeParse(body);

  if (!validation.success) {
    return errorResponse(validation.error.errors[0].message);
  }

  // Check if resident exists and belongs to same building
  const resident = await Resident.findOne({
    _id: new Types.ObjectId(id),
    buildingId: new Types.ObjectId(user.buildingId),
  });

  if (!resident) {
    return errorResponse('Resident not found', 404);
  }

  // Check if user already exists for this resident
  const existingUser = await User.findOne({
    residentId: new Types.ObjectId(id),
    buildingId: new Types.ObjectId(user.buildingId),
  });

  if (existingUser) {
    return errorResponse('User account already exists for this resident', 400);
  }

  // Check if email is already taken
  const emailExists = await User.findOne({
    email: validation.data.email.toLowerCase(),
  });

  if (emailExists) {
    return errorResponse('Email already in use', 400);
  }

  // Create user with hashed password
  const passwordHash = await bcrypt.hash(validation.data.password, 12);
  const newUser = await User.create({
    buildingId: new Types.ObjectId(user.buildingId),
    residentId: new Types.ObjectId(id),
    name: validation.data.name,
    email: validation.data.email.toLowerCase(),
    passwordHash,
    role: 'RESIDENT',
    isActive: true,
  });

  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'create',
    entityType: 'user',
    entityId: newUser._id.toString(),
    after: {
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      residentId: resident._id.toString(),
    },
  });

  return successResponse({
    _id: newUser._id.toString(),
    email: newUser.email,
    name: newUser.name,
    role: newUser.role,
  }, 201);
});
