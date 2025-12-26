import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import { chargeUpdateSchema } from '@/lib/validations';
import { canManageFinances, canAccessApartment } from '@/lib/auth';
import Charge from '@/models/Charge';
import { Types } from 'mongoose';

// GET /api/charges/[id] - Get single charge
export const GET = withAuth(async (request, { user, params }) => {
  const id = params?.id;
  
  if (!id || !Types.ObjectId.isValid(id)) {
    return errorResponse('Invalid charge ID');
  }

  const charge = await Charge.findOne({
    _id: new Types.ObjectId(id),
    buildingId: new Types.ObjectId(user.buildingId),
  })
    .populate('apartmentId', 'number floor')
    .populate('createdBy', 'name')
    .lean();

  if (!charge) {
    return errorResponse('Charge not found', 404);
  }

  // Check access for residents
  if (user.role === 'RESIDENT' && !canAccessApartment(user, charge.apartmentId._id.toString())) {
    return errorResponse('Permission denied', 403);
  }

  return successResponse(charge);
});

// PATCH /api/charges/[id] - Void a charge (only status can be changed)
export const PATCH = withAuth(async (request, { user, params }) => {
  if (!canManageFinances(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const id = params?.id;
  
  if (!id || !Types.ObjectId.isValid(id)) {
    return errorResponse('Invalid charge ID');
  }

  const body = await request.json();
  const validation = chargeUpdateSchema.safeParse(body);

  if (!validation.success) {
    return errorResponse(validation.error.errors[0].message);
  }

  const charge = await Charge.findOne({
    _id: new Types.ObjectId(id),
    buildingId: new Types.ObjectId(user.buildingId),
  });

  if (!charge) {
    return errorResponse('Charge not found', 404);
  }

  if (charge.status === 'voided') {
    return errorResponse('Charge is already voided', 400);
  }

  const before = charge.toObject();
  charge.status = validation.data.status;
  await charge.save();

  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'void',
    entityType: 'charge',
    entityId: charge._id.toString(),
    before,
    after: charge.toObject(),
  });

  return successResponse(charge);
});

