import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import { documentUpdateSchema } from '@/lib/validations';
import { canManageBuilding } from '@/lib/auth';
import DocumentModel from '@/models/Document';
import { Types } from 'mongoose';

// GET /api/documents/[id] - Get single document
export const GET = withAuth(async (request, { user, params }) => {
  const id = params?.id;
  
  if (!id || !Types.ObjectId.isValid(id)) {
    return errorResponse('Invalid document ID');
  }

  const document = await DocumentModel.findOne({
    _id: new Types.ObjectId(id),
    buildingId: new Types.ObjectId(user.buildingId),
  })
    .populate('createdBy', 'name')
    .lean();

  if (!document) {
    return errorResponse('Document not found', 404);
  }

  // Check visibility for residents
  if (user.role === 'RESIDENT' && document.visibility === 'board_only') {
    return errorResponse('Permission denied', 403);
  }

  return successResponse(document);
});

// PATCH /api/documents/[id] - Update document
export const PATCH = withAuth(async (request, { user, params }) => {
  if (!canManageBuilding(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const id = params?.id;
  
  if (!id || !Types.ObjectId.isValid(id)) {
    return errorResponse('Invalid document ID');
  }

  const body = await request.json();
  const validation = documentUpdateSchema.safeParse(body);

  if (!validation.success) {
    return errorResponse(validation.error.errors[0].message);
  }

  const document = await DocumentModel.findOne({
    _id: new Types.ObjectId(id),
    buildingId: new Types.ObjectId(user.buildingId),
  });

  if (!document) {
    return errorResponse('Document not found', 404);
  }

  const before = document.toObject();
  Object.assign(document, validation.data);
  await document.save();

  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'update',
    entityType: 'document',
    entityId: document._id.toString(),
    before,
    after: document.toObject(),
  });

  return successResponse(document);
});

// DELETE /api/documents/[id] - Delete document
export const DELETE = withAuth(async (request, { user, params }) => {
  if (!canManageBuilding(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const id = params?.id;
  
  if (!id || !Types.ObjectId.isValid(id)) {
    return errorResponse('Invalid document ID');
  }

  const document = await DocumentModel.findOne({
    _id: new Types.ObjectId(id),
    buildingId: new Types.ObjectId(user.buildingId),
  });

  if (!document) {
    return errorResponse('Document not found', 404);
  }

  const before = document.toObject();
  await document.deleteOne();

  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'delete',
    entityType: 'document',
    entityId: id,
    before,
  });

  return successResponse({ message: 'Document deleted' });
});

