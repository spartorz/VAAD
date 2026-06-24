import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { canManageFinances } from '@/lib/auth';
import { getIncomeVsExpenseReport } from '@/lib/reports/report-service';

function parseNumber(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

// GET /api/reports/income-vs-expense
export const GET = withAuth(async (request, { user }) => {
  if (!canManageFinances(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const { searchParams } = new URL(request.url);
  const month = parseNumber(searchParams.get('month'));
  const year = parseNumber(searchParams.get('year'));

  const data = await getIncomeVsExpenseReport(user.buildingId, { month, year });
  return successResponse(data);
});
