import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { canManageFinances } from '@/lib/auth';
import { getInvoiceCenterExpenseData } from '@/lib/invoices/invoice-center-service';

function parseNumber(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return undefined;
  return parsed;
}

// GET /api/invoice-center/expenses
export const GET = withAuth(async (request, { user }) => {
  if (!canManageFinances(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const { searchParams } = new URL(request.url);
  const month = parseNumber(searchParams.get('month'));
  const year = parseNumber(searchParams.get('year'));

  const data = await getInvoiceCenterExpenseData({
    buildingId: user.buildingId,
    month,
    year,
  });

  return successResponse(data);
});
