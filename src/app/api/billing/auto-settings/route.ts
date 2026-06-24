import { Types } from 'mongoose';
import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { canManageFinances } from '@/lib/auth';
import AutoBillingSettings from '@/models/AutoBillingSettings';
import Building from '@/models/Building';
import { autoBillingSettingsSchema } from '@/lib/validations';
import { auditAutoBillingEvent, getOrCreateAutoBillingSettings } from '@/lib/billing/auto-billing-service';

// GET /api/billing/auto-settings
export const GET = withAuth(async (_request, { user }) => {
  if (!canManageFinances(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const settings = await getOrCreateAutoBillingSettings(user.buildingId);
  return successResponse(settings);
});

// PATCH /api/billing/auto-settings
export const PATCH = withAuth(async (request, { user }) => {
  if (!canManageFinances(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const body = await request.json().catch(() => null);
  if (!body) return errorResponse('Invalid JSON body', 400);

  const parsed = autoBillingSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.errors[0]?.message || 'Invalid payload', 400);
  }

  const building = await Building.findById(user.buildingId).select('settings.currency').lean();
  if (!building) return errorResponse('Building not found', 404);

  const payload = parsed.data;
  const resolvedCurrency = payload.currency || building.settings?.currency || 'ILS';

  const nextRunCandidate = new Date();
  const nextRunDate = new Date(
    nextRunCandidate.getFullYear(),
    nextRunCandidate.getMonth(),
    payload.chargeDayOfMonth,
    0,
    0,
    0,
    0
  );
  if (nextRunDate < nextRunCandidate) {
    nextRunDate.setMonth(nextRunDate.getMonth() + 1);
  }

  const updated = await AutoBillingSettings.findOneAndUpdate(
    { buildingId: new Types.ObjectId(user.buildingId) },
    {
      $set: {
        ...payload,
        currency: resolvedCurrency,
        nextAutoBillingRunAt: payload.autoBillingEnabled ? nextRunDate : undefined,
        updatedBy: new Types.ObjectId(user.id),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  await auditAutoBillingEvent({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'auto_billing_settings_updated',
    metadata: {
      autoBillingEnabled: updated?.autoBillingEnabled,
      monthlyAmount: updated?.monthlyAmount,
      chargeDayOfMonth: updated?.chargeDayOfMonth,
      dueDayOfMonth: updated?.dueDayOfMonth,
      requireApprovalBeforeGeneration: updated?.requireApprovalBeforeGeneration,
    },
  });

  return successResponse(updated);
});
