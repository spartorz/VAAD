import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import NotificationBatch from '@/models/NotificationBatch';
import { Types } from 'mongoose';

/**
 * POST /api/notifications/batches/[batchId]/approve
 *
 * Transitions a batch from ready_for_review → ready.
 * Sets approvedBy / approvedAt. Audits the action.
 */
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

    if (batch.status !== 'ready_for_review') {
      return errorResponse(
        `Batch cannot be approved — current status: ${batch.status}`,
        400
      );
    }

    batch.status = 'ready';
    batch.approvedBy = new Types.ObjectId(user.id);
    batch.approvedAt = new Date();
    await batch.save();

    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'notification_batch_approved',
      entityType: 'notification_batch',
      entityId: batchId,
      metadata: {
        month: batch.month,
        channel: batch.channel,
        totalRecipients: batch.stats.total,
        skippedCount: batch.skippedCount,
      },
    });

    return successResponse({ ok: true, status: batch.status });
  },
  { requiredRole: 'BOARD' }
);
