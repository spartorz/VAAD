import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import NotificationItem from '@/models/NotificationItem';
import NotificationBatch from '@/models/NotificationBatch';
import { refreshBatchStats } from '@/lib/notifications/batch-service';
import { Types } from 'mongoose';

const statusUpdateSchema = z.object({
  status: z.enum(['delivered', 'read', 'failed', 'cancelled']),
  failureCode: z
    .enum(['invalid_phone', 'provider_error', 'rate_limited', 'blocked_by_user', 'unknown'])
    .optional(),
  failureReason: z.string().max(300).optional(),
});

/**
 * POST /api/notifications/items/[itemId]/status
 * Controlled internal transition endpoint for communication lifecycle tracking.
 * No external provider/webhook required; building-scoped and role-protected.
 */
export const POST = withAuth(
  async (request: NextRequest, { user, params }) => {
    const itemId = params?.itemId;
    if (!itemId || !Types.ObjectId.isValid(itemId)) {
      return errorResponse('Invalid item ID', 400);
    }

    const body = await request.json().catch(() => null);
    if (!body) return errorResponse('Invalid JSON body', 400);

    const parsed = statusUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.errors.map((e) => e.message).join(', '), 400);
    }

    const item = await NotificationItem.findOne({
      _id: new Types.ObjectId(itemId),
      buildingId: new Types.ObjectId(user.buildingId),
    });
    if (!item) return errorResponse('Item not found', 404);

    const batch = await NotificationBatch.findOne({
      _id: item.batchId,
      buildingId: new Types.ObjectId(user.buildingId),
    }).lean();
    if (!batch) return errorResponse('Batch not found', 404);

    const now = new Date();
    item.status = parsed.data.status;
    item.lastAttemptAt = now;

    if (parsed.data.status === 'delivered') {
      item.deliveredAt = now;
      item.failureCode = undefined;
      item.failureReason = undefined;
    }
    if (parsed.data.status === 'read') {
      item.readAt = now;
      if (!item.deliveredAt) item.deliveredAt = now;
      item.failureCode = undefined;
      item.failureReason = undefined;
    }
    if (parsed.data.status === 'failed') {
      item.failedAt = now;
      item.failureCode = parsed.data.failureCode || 'unknown';
      item.failureReason = parsed.data.failureReason || undefined;
      item.retryHistory = [
        ...(item.retryHistory || []),
        {
          attempt: Math.max(item.retryCount, 1),
          timestamp: now,
          result: 'failed',
          reason: item.failureReason || item.failureCode,
        },
      ];
    }

    await item.save();
    await refreshBatchStats(item.batchId.toString());

    const auditAction =
      parsed.data.status === 'delivered'
        ? 'notification_delivered'
        : parsed.data.status === 'read'
          ? 'notification_read'
          : parsed.data.status === 'failed'
            ? 'notification_failed'
            : 'notification_marked_failed';

    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: auditAction,
      entityType: 'notification_item',
      entityId: itemId,
      metadata: {
        batchId: item.batchId.toString(),
        status: parsed.data.status,
        failureCode: item.failureCode,
        failureReason: item.failureReason,
      },
    });

    return successResponse({ ok: true, status: item.status });
  },
  { requiredRole: 'BOARD' }
);
