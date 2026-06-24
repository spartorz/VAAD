import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import NotificationItem from '@/models/NotificationItem';
import NotificationBatch from '@/models/NotificationBatch';
import { refreshBatchStats } from '@/lib/notifications/batch-service';
import { Types } from 'mongoose';

/**
 * POST /api/notifications/items/[itemId]/retry
 *
 * Resets a failed NotificationItem back to pending so it can be re-sent.
 * Only items with retryCount < maxRetries and status === 'failed' are eligible.
 */
export const POST = withAuth(
  async (_request: NextRequest, { user, params }) => {
    const itemId = params?.itemId;
    if (!itemId || !Types.ObjectId.isValid(itemId)) {
      return errorResponse('Invalid item ID', 400);
    }

    const item = await NotificationItem.findOne({
      _id: new Types.ObjectId(itemId),
      buildingId: new Types.ObjectId(user.buildingId),
    });

    if (!item) return errorResponse('Item not found', 404);

    if (item.status !== 'failed') {
      return errorResponse(
        `Item cannot be retried — current status: ${item.status}`,
        400
      );
    }

    if (item.retryCount >= item.maxRetries) {
      return errorResponse(
        `Maximum retries (${item.maxRetries}) reached for this item`,
        400
      );
    }

    // Verify batch is still active
    const batch = await NotificationBatch.findOne({
      _id: item.batchId,
      buildingId: new Types.ObjectId(user.buildingId),
    }).lean();

    if (!batch || batch.status === 'cancelled') {
      return errorResponse('Parent batch is cancelled or not found', 400);
    }

    const now = new Date();
    const nextAttempt = item.retryCount + 1;
    item.status = 'retrying';
    item.retryCount = nextAttempt;
    item.lastRetryAt = now;
    item.failureReason = undefined;
    item.failureCode = undefined;
    item.retryHistory = [
      ...(item.retryHistory || []),
      {
        attempt: nextAttempt,
        timestamp: now,
        result: 'started',
        reason: 'manual_retry_requested',
      },
      {
        attempt: nextAttempt,
        timestamp: now,
        result: 'completed',
        reason: 'moved_to_retrying',
      },
    ];
    await item.save();

    refreshBatchStats(item.batchId.toString()).catch((err) =>
      console.error('Failed to refresh batch stats', err)
    );

    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'notification_retry_started',
      entityType: 'notification_item',
      entityId: itemId,
      metadata: {
        batchId: item.batchId.toString(),
        retryCount: item.retryCount,
      },
    });

    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'notification_retry_completed',
      entityType: 'notification_item',
      entityId: itemId,
      metadata: {
        batchId: item.batchId.toString(),
        retryCount: item.retryCount,
        status: item.status,
      },
    });

    return successResponse({ ok: true, retryCount: item.retryCount });
  },
  { requiredRole: 'BOARD' }
);
