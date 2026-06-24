import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import NotificationItem from '@/models/NotificationItem';
import NotificationBatch from '@/models/NotificationBatch';
import { Types } from 'mongoose';

/**
 * GET /api/notifications/history?apartmentId=<id>&limit=<n>
 *
 * Returns recent notification history for a specific apartment.
 * Shows opened/sent/failed items across all batches for this building.
 */
export const GET = withAuth(
  async (request: NextRequest, { user }) => {
    const { searchParams } = new URL(request.url);
    const apartmentId = searchParams.get('apartmentId');
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50);

    if (!apartmentId || !Types.ObjectId.isValid(apartmentId)) {
      return errorResponse('apartmentId is required and must be valid', 400);
    }

    const items = await NotificationItem.find({
      buildingId: new Types.ObjectId(user.buildingId),
      apartmentId: new Types.ObjectId(apartmentId),
      status: { $in: ['opened_manual', 'sent', 'delivered', 'read', 'failed', 'retrying'] },
    })
      .sort({ lastAttemptAt: -1, createdAt: -1 })
      .limit(limit)
      .select('_id batchId status lastAttemptAt sentAt channel type metadata skipReason')
      .lean();

    if (items.length === 0) return successResponse([]);

    // Hydrate batch month labels
    const batchIds = [...new Set(items.map((i) => i.batchId.toString()))];
    const batches = await NotificationBatch.find({
      _id: { $in: batchIds.map((id) => new Types.ObjectId(id)) },
    })
      .select('_id month title channel')
      .lean();

    const batchMap = new Map(batches.map((b) => [b._id.toString(), b]));

    const enriched = items.map((item) => ({
      ...item,
      batch: batchMap.get(item.batchId.toString()) ?? null,
    }));

    return successResponse(enriched);
  },
  { requiredRole: 'BOARD' }
);
