import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { canManageFinances } from '@/lib/auth';
import { autoBillingPreviewSchema } from '@/lib/validations';
import { auditAutoBillingEvent, buildAutoBillingPreview } from '@/lib/billing/auto-billing-service';

// POST /api/billing/auto-billing/preview
export const POST = withAuth(async (request, { user }) => {
  if (!canManageFinances(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const body = await request.json().catch(() => ({}));
  const parsed = autoBillingPreviewSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.errors[0]?.message || 'Invalid payload', 400);
  }

  const preview = await buildAutoBillingPreview({
    buildingId: user.buildingId,
    period: parsed.data.period,
    excludeApartmentIds: parsed.data.excludeApartmentIds,
    monthlyAmountOverride: parsed.data.monthlyAmountOverride,
    mode: 'preview',
  });

  await auditAutoBillingEvent({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'auto_billing_preview_generated',
    metadata: {
      period: preview.period,
      eligibleCount: preview.eligibleCount,
      skippedCount: preview.skippedCount,
      totalAmount: preview.totalAmount,
      mode: 'preview',
    },
  });

  return successResponse(preview);
});
