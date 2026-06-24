import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import NotificationBatch from '@/models/NotificationBatch';
import { Types } from 'mongoose';

// GET /api/notifications/batches/[batchId]
export const GET = withAuth(
  async (_request: NextRequest, { user, params }) => {
    const batchId = params?.batchId;
    if (!batchId || !Types.ObjectId.isValid(batchId)) {
      return errorResponse('Invalid batch ID', 400);
    }

    const batch = await NotificationBatch.findOne({
      _id: new Types.ObjectId(batchId),
      buildingId: new Types.ObjectId(user.buildingId),
    }).lean();

    if (!batch) return errorResponse('Batch not found', 404);

    return successResponse(batch);
  },
  { requiredRole: 'BOARD' }
);
