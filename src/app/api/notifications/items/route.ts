import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import NotificationItem from '@/models/NotificationItem';
import NotificationBatch from '@/models/NotificationBatch';
import { Types } from 'mongoose';

// GET /api/notifications/items?batchId=<id>
export const GET = withAuth(
  async (request: NextRequest, { user }) => {
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batchId');
    const status = searchParams.get('status');
    const search = searchParams.get('search')?.trim();
    const failureOnly = searchParams.get('failureOnly') === 'true';
    const retryOnly = searchParams.get('retryOnly') === 'true';

    if (!batchId || !Types.ObjectId.isValid(batchId)) {
      return errorResponse('batchId query parameter is required and must be valid', 400);
    }

    // Verify batch belongs to the requesting user's building
    const batch = await NotificationBatch.findOne({
      _id: new Types.ObjectId(batchId),
      buildingId: new Types.ObjectId(user.buildingId),
    }).lean();

    if (!batch) return errorResponse('Batch not found', 404);

    const query: Record<string, unknown> = { batchId: new Types.ObjectId(batchId) };
    if (status) query.status = status;
    if (failureOnly) query.failureCode = { $exists: true, $ne: null };
    if (retryOnly) query.retryCount = { $gt: 0 };

    const items = await NotificationItem.find(query)
      .select(
        '_id apartmentId residentId phone status retryCount maxRetries lastAttemptAt queuedAt sentAt deliveredAt readAt failedAt ' +
        'lastRetryAt failureCode failureReason retryHistory provider providerMessageId skipReason metadata createdAt updatedAt'
      )
      .populate('apartmentId', 'number floor')
      .populate('residentId', 'fullName phone')
      .sort({ createdAt: -1 })
      .lean();

    const filteredItems = search
      ? items.filter((item) => {
          const needle = search.toLowerCase();
          const apartmentNumber = (item.apartmentId as { number?: string } | undefined)?.number || '';
          const residentName = (item.residentId as { fullName?: string } | undefined)?.fullName || '';
          const phone = item.phone || '';
          return (
            apartmentNumber.toLowerCase().includes(needle) ||
            residentName.toLowerCase().includes(needle) ||
            phone.toLowerCase().includes(needle)
          );
        })
      : items;

    return successResponse(filteredItems);
  },
  { requiredRole: 'BOARD' }
);
