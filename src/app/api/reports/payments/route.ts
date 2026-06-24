import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { canManageFinances } from '@/lib/auth';
import { getPaymentReport } from '@/lib/reports/report-service';

// GET /api/reports/payments
export const GET = withAuth(async (request, { user }) => {
  if (!canManageFinances(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const { searchParams } = new URL(request.url);
  const apartmentId = searchParams.get('apartmentId') || undefined;
  const residentId = searchParams.get('residentId') || undefined;
  const from = searchParams.get('from') || undefined;
  const to = searchParams.get('to') || undefined;

  const data = await getPaymentReport(user.buildingId, { apartmentId, residentId, from, to });
  return successResponse(data);
});
