import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import NotificationBatch from '@/models/NotificationBatch';
import NotificationItem from '@/models/NotificationItem';
import { Types } from 'mongoose';
import { NotificationItemStatus } from '@/lib/types';

// POST /api/notifications/batches/[batchId]/cancel
export const POST = withAuth(
  async (_request: NextRequest, { user, params }) => {
    const batchId = params?.batchId;
    if (!batchId || !Types.ObjectId.isValid(batchId)) {
      return errorResponse('Invalid batch ID', 400);
    }

    const batch = await NotificationBatch.findOne({
      _id: new Types.ObjectId(batchId),
      buildingId: new Types.ObjectId(user.buildingId),
    });

    if (!batch) return errorResponse('Batch not found', 404);
    if (batch.status === 'cancelled') return errorResponse('Batch is already cancelled', 400);

    batch.status = 'cancelled';
    await batch.save();

    // Cancel all pending/queued items — already-opened/sent items are left as-is
    await NotificationItem.updateMany(
      {
        batchId: batch._id,
        status: { $in: ['pending', 'queued'] satisfies NotificationItemStatus[] },
      },
      { $set: { status: 'cancelled' as NotificationItemStatus } }
    );

    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'notification_batch_cancelled',
      entityType: 'notification_batch',
      entityId: batchId,
      metadata: { month: batch.month, channel: batch.channel },
    });

    return successResponse({ ok: true });
  },
  { requiredRole: 'BOARD' }
);
