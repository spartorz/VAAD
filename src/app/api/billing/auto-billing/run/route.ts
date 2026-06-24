import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { canManageFinances } from '@/lib/auth';
import { autoBillingRunSchema } from '@/lib/validations';
import { auditAutoBillingEvent, runAutoBilling } from '@/lib/billing/auto-billing-service';

// POST /api/billing/auto-billing/run
export const POST = withAuth(async (request, { user }) => {
  if (!canManageFinances(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const body = await request.json().catch(() => null);
  if (!body) return errorResponse('Invalid JSON body', 400);

  const parsed = autoBillingRunSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.errors[0]?.message || 'Invalid payload', 400);
  }

  const input = parsed.data;

  await auditAutoBillingEvent({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'auto_billing_run_started',
    metadata: { period: input.period, mode: 'manual' },
  });

  try {
    const result = await runAutoBilling({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      period: input.period,
      excludeApartmentIds: input.excludeApartmentIds,
      monthlyAmountOverride: input.monthlyAmountOverride,
      mode: 'manual',
      confirm: input.confirm,
    });

    if (result.approvalRequired) {
      await auditAutoBillingEvent({
        buildingId: user.buildingId,
        actorUserId: user.id,
        actorName: user.name,
        action: 'auto_billing_skipped',
        metadata: {
          period: result.period,
          eligibleCount: result.eligibleCount,
          createdCount: result.createdCount,
          skippedCount: result.skippedCount,
          totalAmount: result.totalAmount,
          mode: 'manual',
          reason: 'approval_required',
        },
      });
      return successResponse(result);
    }

    await auditAutoBillingEvent({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'auto_billing_charges_generated',
      metadata: {
        period: result.period,
        eligibleCount: result.eligibleCount,
        createdCount: result.createdCount,
        skippedCount: result.skippedCount,
        totalAmount: result.totalAmount,
        mode: 'manual',
      },
    });

    return successResponse(result, 201);
  } catch (error) {
    await auditAutoBillingEvent({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'auto_billing_failed',
      metadata: {
        period: input.period,
        mode: 'manual',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });
    return errorResponse(error instanceof Error ? error.message : 'Auto billing failed', 500);
  }
});
