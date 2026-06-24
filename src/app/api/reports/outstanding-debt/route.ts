import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { canManageFinances } from '@/lib/auth';
import { getOutstandingDebtReport } from '@/lib/reports/report-service';

// GET /api/reports/outstanding-debt?sortBy=highest_debt|oldest_debt
export const GET = withAuth(async (request, { user }) => {
  if (!canManageFinances(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const { searchParams } = new URL(request.url);
  const sortByParam = searchParams.get('sortBy');
  const sortBy = sortByParam === 'oldest_debt' ? 'oldest_debt' : 'highest_debt';

  const data = await getOutstandingDebtReport(user.buildingId, sortBy);
  return successResponse({ sortBy, rows: data });
});
