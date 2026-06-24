import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import { vendorUpdateSchema } from '@/lib/validations';
import { canManageBuilding } from '@/lib/auth';
import Vendor from '@/models/Vendor';
import MaintenanceTicket from '@/models/MaintenanceTicket';
import { Types } from 'mongoose';

// GET /api/vendors/[id] - Get single vendor
export const GET = withAuth(async (request, { user, params }) => {
  const id = params?.id;
  
  if (!id || !Types.ObjectId.isValid(id)) {
    return errorResponse('Invalid vendor ID');
  }

  const vendor = await Vendor.findOne({
    _id: new Types.ObjectId(id),
    buildingId: new Types.ObjectId(user.buildingId),
  }).lean();

  if (!vendor) {
    return errorResponse('Vendor not found', 404);
  }

  return successResponse(vendor);
});

// PATCH /api/vendors/[id] - Update vendor
export const PATCH = withAuth(async (request, { user, params }) => {
  if (!canManageBuilding(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const id = params?.id;
  
  if (!id || !Types.ObjectId.isValid(id)) {
    return errorResponse('Invalid vendor ID');
  }

  const body = await request.json();
  const validation = vendorUpdateSchema.safeParse(body);

  if (!validation.success) {
    return errorResponse(validation.error.errors[0].message);
  }

  const vendor = await Vendor.findOne({
    _id: new Types.ObjectId(id),
    buildingId: new Types.ObjectId(user.buildingId),
  });

  if (!vendor) {
    return errorResponse('Vendor not found', 404);
  }

  const before = vendor.toObject();
  const wasActive = vendor.isActive !== false;
  Object.assign(vendor, validation.data);
  await vendor.save();

  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'update',
    entityType: 'vendor',
    entityId: vendor._id.toString(),
    before,
    after: vendor.toObject(),
  });

  if (wasActive && vendor.isActive === false) {
    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'vendor_deactivated',
      entityType: 'vendor',
      entityId: vendor._id.toString(),
      metadata: { vendorName: vendor.name },
    });
  }

  return successResponse(vendor);
});

// DELETE /api/vendors/[id] - Delete vendor
export const DELETE = withAuth(async (request, { user, params }) => {
  if (!canManageBuilding(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const id = params?.id;
  
  if (!id || !Types.ObjectId.isValid(id)) {
    return errorResponse('Invalid vendor ID');
  }

  const vendor = await Vendor.findOne({
    _id: new Types.ObjectId(id),
    buildingId: new Types.ObjectId(user.buildingId),
  });

  if (!vendor) {
    return errorResponse('Vendor not found', 404);
  }

  const openLinkedTickets = await MaintenanceTicket.countDocuments({
    buildingId: new Types.ObjectId(user.buildingId),
    vendorId: new Types.ObjectId(id),
    status: { $nin: ['closed'] },
  });
  if (openLinkedTickets > 0) {
    return errorResponse('Cannot delete vendor with open linked tickets. Deactivate instead.', 409);
  }

  const before = vendor.toObject();
  await vendor.deleteOne();

  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'delete',
    entityType: 'vendor',
    entityId: id,
    before,
  });

  return successResponse({ message: 'Vendor deleted' });
});

