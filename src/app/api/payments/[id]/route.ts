import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import { paymentUpdateSchema } from '@/lib/validations';
import { canManageFinances, canAccessApartment } from '@/lib/auth';
import Payment from '@/models/Payment';
import { Types } from 'mongoose';

// GET /api/payments/[id] - Get single payment
export const GET = withAuth(async (request, { user, params }) => {
  const id = params?.id;
  
  if (!id || !Types.ObjectId.isValid(id)) {
    return errorResponse('Invalid payment ID');
  }

  const payment = await Payment.findOne({
    _id: new Types.ObjectId(id),
    buildingId: new Types.ObjectId(user.buildingId),
  })
    .populate('apartmentId', 'number floor')
    .populate('residentId', 'fullName')
    .populate('createdBy', 'name')
    .lean();

  if (!payment) {
    return errorResponse('Payment not found', 404);
  }

  // Check access for residents
  if (user.role === 'RESIDENT' && !canAccessApartment(user, payment.apartmentId._id.toString())) {
    return errorResponse('Permission denied', 403);
  }

  return successResponse(payment);
});

// PATCH /api/payments/[id] - Void a payment (only status can be changed)
export const PATCH = withAuth(async (request, { user, params }) => {
  if (!canManageFinances(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const id = params?.id;
  
  if (!id || !Types.ObjectId.isValid(id)) {
    return errorResponse('Invalid payment ID');
  }

  const body = await request.json();
  const validation = paymentUpdateSchema.safeParse(body);

  if (!validation.success) {
    return errorResponse(validation.error.errors[0].message);
  }

  const payment = await Payment.findOne({
    _id: new Types.ObjectId(id),
    buildingId: new Types.ObjectId(user.buildingId),
  });

  if (!payment) {
    return errorResponse('Payment not found', 404);
  }

  if (payment.status === 'voided') {
    return errorResponse('Payment is already voided', 400);
  }

  const before = payment.toObject();
  payment.status = validation.data.status;
  await payment.save();

  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'void',
    entityType: 'payment',
    entityId: payment._id.toString(),
    before,
    after: payment.toObject(),
  });

  return successResponse(payment);
});

