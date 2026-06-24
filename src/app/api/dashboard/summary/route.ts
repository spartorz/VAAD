import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { canManageBuilding, canManageFinances } from '@/lib/auth';
import { getExecutiveDashboardSummary } from '@/lib/dashboard/executive-summary';

// GET /api/dashboard/summary?period=YYYY-MM
export const GET = withAuth(async (request, { user }) => {
  if (!canManageBuilding(user.role) && !canManageFinances(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || undefined;

  if (period && !/^\d{4}-\d{2}$/.test(period)) {
    return errorResponse('Invalid period format. Use YYYY-MM', 400);
  }

  const summary = await getExecutiveDashboardSummary(user.buildingId, period);
  return successResponse(summary);
});
