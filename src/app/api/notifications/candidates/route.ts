import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { fetchNotificationCandidates } from '@/lib/notifications/batch-service';

/**
 * GET /api/notifications/candidates?month=YYYY-MM
 *
 * Returns the enriched candidate list for batch targeting:
 * - All unpaid/partial apartments for the given month
 * - Resident info (name, phone, type)
 * - Phone validity
 * - Cooldown status (clear / recently_contacted) per building settings
 *
 * Used by the targeting UI before batch generation. Does not create any records.
 */
export const GET = withAuth(
  async (request: NextRequest, { user }) => {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return errorResponse('month is required and must match YYYY-MM', 400);
    }

    const candidates = await fetchNotificationCandidates(user.buildingId, month);

    // Serialize Date fields for JSON transport
    const data = candidates.map((c) => ({
      ...c,
      lastContactAt: c.lastContactAt?.toISOString() ?? null,
    }));

    return successResponse(data);
  },
  { requiredRole: 'BOARD' }
);
