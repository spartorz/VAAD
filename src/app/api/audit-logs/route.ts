import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, getPaginationParams, buildSortObject } from '@/lib/api-utils';
import { paginationSchema } from '@/lib/validations';
import { canViewAuditLog } from '@/lib/auth';
import AuditLog from '@/models/AuditLog';
import { Types } from 'mongoose';

// GET /api/audit-logs - List audit logs for the building
export const GET = withAuth(async (request, { user }) => {
  if (!canViewAuditLog(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const { searchParams } = new URL(request.url);
  const params = getPaginationParams(request);
  const validation = paginationSchema.safeParse(params);
  
  if (!validation.success) {
    return errorResponse('Invalid pagination parameters');
  }

  const { page, limit, sortOrder } = validation.data;
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = { buildingId: new Types.ObjectId(user.buildingId) };
  
  // Filter by entity type
  const entityType = searchParams.get('entityType');
  if (entityType) {
    query.entityType = entityType;
  }

  // Filter by action
  const action = searchParams.get('action');
  if (action) {
    query.action = action;
  }

  // Filter by actor
  const actorUserId = searchParams.get('actorUserId');
  if (actorUserId && Types.ObjectId.isValid(actorUserId)) {
    query.actorUserId = new Types.ObjectId(actorUserId);
  }

  // Filter by date range
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) (query.createdAt as Record<string, Date>).$gte = new Date(startDate);
    if (endDate) (query.createdAt as Record<string, Date>).$lte = new Date(endDate);
  }

  const [logs, total] = await Promise.all([
    AuditLog.find(query)
      .populate('actorUserId', 'name email')
      .sort(buildSortObject('createdAt', sortOrder))
      .skip(skip)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(query),
  ]);

  return successResponse({
    data: logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}, { requiredRole: 'BOARD' });

