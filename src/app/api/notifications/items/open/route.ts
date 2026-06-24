import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import NotificationItem from '@/models/NotificationItem';
import NotificationBatch from '@/models/NotificationBatch';
import { refreshBatchStats } from '@/lib/notifications/batch-service';
import { Types } from 'mongoose';

const openSchema = z.object({
  batchId: z.string(),
  apartmentId: z.string(),
});

/**
 * POST /api/notifications/items/open
 *
 * Called (fire-and-forget) from the notifications page when a user opens a
 * WhatsApp link. Marks the matching NotificationItem as opened_manual.
 *
 * This supplements (does not replace) the existing /api/notifications/log call.
 */
export const POST = withAuth(
  async (request: NextRequest, { user }) => {
    const body = await request.json().catch(() => null);
    if (!body) return errorResponse('Invalid JSON body', 400);

    const parsed = openSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.errors.map((e) => e.message).join(', '), 400);
    }

    const { batchId, apartmentId } = parsed.data;

    if (!Types.ObjectId.isValid(batchId) || !Types.ObjectId.isValid(apartmentId)) {
      return errorResponse('Invalid ID format', 400);
    }

    // Verify batch is scoped to this building
    const batch = await NotificationBatch.findOne({
      _id: new Types.ObjectId(batchId),
      buildingId: new Types.ObjectId(user.buildingId),
    }).lean();

    if (!batch) return errorResponse('Batch not found', 404);

    const now = new Date();

    const item = await NotificationItem.findOneAndUpdate(
      {
        batchId: new Types.ObjectId(batchId),
        apartmentId: new Types.ObjectId(apartmentId),
        // Only transition from pending/queued/failed — don't re-open sent items
        status: { $in: ['pending', 'queued', 'failed', 'retrying', 'draft'] },
      },
      {
        $set: {
          status: 'opened_manual',
          lastAttemptAt: now,
          sentAt: now,
          provider: 'manual',
        },
        $inc: { retryCount: 0 }, // touch updatedAt without re-incrementing
      },
      { new: true }
    );

    if (!item) {
      // Item may already be in opened_manual/sent/cancelled — that's fine
      return successResponse({ ok: true, updated: false });
    }

    // Refresh aggregate stats on the batch (non-blocking)
    refreshBatchStats(batchId).catch((err) =>
      console.error('Failed to refresh batch stats', err)
    );

    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'notification_item_opened_manual',
      entityType: 'notification_item',
      entityId: item._id.toString(),
      metadata: {
        batchId,
        apartmentId,
        month: batch.month,
      },
    });

    return successResponse({ ok: true, updated: true });
  },
  { requiredRole: 'TREASURER' }
);
