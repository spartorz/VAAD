import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { canManageFinances } from '@/lib/auth';
import { getVendorExpenseReport } from '@/lib/reports/report-service';

function parseNumber(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

// GET /api/reports/vendor-expenses
export const GET = withAuth(async (request, { user }) => {
  if (!canManageFinances(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const { searchParams } = new URL(request.url);
  const data = await getVendorExpenseReport(user.buildingId, {
    month: parseNumber(searchParams.get('month')),
    year: parseNumber(searchParams.get('year')),
    vendorId: searchParams.get('vendorId') || undefined,
    amountMin: parseNumber(searchParams.get('amountMin')),
    amountMax: parseNumber(searchParams.get('amountMax')),
  });

  return successResponse(data);
});
