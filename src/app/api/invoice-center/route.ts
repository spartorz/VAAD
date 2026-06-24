import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { canManageFinances } from '@/lib/auth';
import { getInvoiceCenterData } from '@/lib/invoices/invoice-center-service';

function parseBoolean(value: string | null) {
  if (value == null) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function parseNumber(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return undefined;
  return parsed;
}

// GET /api/invoice-center
export const GET = withAuth(async (request, { user }) => {
  if (!canManageFinances(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const { searchParams } = new URL(request.url);
  const month = parseNumber(searchParams.get('month'));
  const year = parseNumber(searchParams.get('year'));
  const page = parseNumber(searchParams.get('page'));
  const limit = parseNumber(searchParams.get('limit'));
  const amountMin = parseNumber(searchParams.get('amountMin'));
  const amountMax = parseNumber(searchParams.get('amountMax'));

  const data = await getInvoiceCenterData({
    buildingId: user.buildingId,
    month,
    year,
    page,
    limit,
    vendorId: searchParams.get('vendorId') || undefined,
    amountMin,
    amountMax,
    hasFile: parseBoolean(searchParams.get('hasFile')),
    missingFile: parseBoolean(searchParams.get('missingFile')),
    search: searchParams.get('search') || undefined,
  });

  return successResponse(data);
});
