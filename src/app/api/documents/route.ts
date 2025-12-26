import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, getPaginationParams, buildSortObject, createAuditLog } from '@/lib/api-utils';
import { documentSchema, paginationSchema } from '@/lib/validations';
import { canManageBuilding } from '@/lib/auth';
import DocumentModel from '@/models/Document';
import { Types } from 'mongoose';

// GET /api/documents - List documents for the building
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
  
  // Filter by category
  const category = searchParams.get('category');
  if (category) {
    query.category = category;
  }

  // Filter by visibility based on role
  if (user.role === 'RESIDENT') {
    query.visibility = { $in: ['public', 'residents_only'] };
  }

  // Search by title
  if (search) {
    query.title = { $regex: search, $options: 'i' };
  }

  const [documents, total] = await Promise.all([
    DocumentModel.find(query)
      .populate('createdBy', 'name')
      .sort(buildSortObject(sortBy, sortOrder))
      .skip(skip)
      .limit(limit)
      .lean(),
    DocumentModel.countDocuments(query),
  ]);

  return successResponse({
    data: documents,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// POST /api/documents - Create new document
export const POST = withAuth(async (request, { user }) => {
  if (!canManageBuilding(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const body = await request.json();
  const validation = documentSchema.safeParse({
    ...body,
    buildingId: user.buildingId,
  });

  if (!validation.success) {
    return errorResponse(validation.error.errors[0].message);
  }

  const document = await DocumentModel.create({
    ...validation.data,
    buildingId: new Types.ObjectId(user.buildingId),
    createdBy: new Types.ObjectId(user.id),
  });

  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'create',
    entityType: 'document',
    entityId: document._id.toString(),
    after: document.toObject(),
  });

  return successResponse(document, 201);
}, { requiredRole: 'RESIDENT' });

