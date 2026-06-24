import { Types } from 'mongoose';
import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import { canManageBuilding } from '@/lib/auth';
import TicketSlaPolicy from '@/models/TicketSlaPolicy';
import { ticketSlaPolicySchema } from '@/lib/validations';

// GET /api/tickets/sla-policy
export const GET = withAuth(async (_request, { user }) => {
  if (!canManageBuilding(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const policy = await TicketSlaPolicy.findOne({
    buildingId: new Types.ObjectId(user.buildingId),
  }).lean();

  if (!policy) {
    return successResponse({
      responseTargetsMinutes: { low: 1440, medium: 480, high: 240, urgent: 60 },
      resolutionTargetsMinutes: { low: 10080, medium: 4320, high: 1440, urgent: 360 },
      gracePeriodMinutes: 0,
      businessHoursOnly: false,
      version: 1,
    });
  }

  return successResponse(policy);
});

// PATCH /api/tickets/sla-policy
export const PATCH = withAuth(async (request, { user }) => {
  if (!canManageBuilding(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const body = await request.json().catch(() => null);
  if (!body) return errorResponse('Invalid JSON body', 400);

  const parsed = ticketSlaPolicySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.errors[0]?.message || 'Validation failed', 400);
  }

  const current = await TicketSlaPolicy.findOne({
    buildingId: new Types.ObjectId(user.buildingId),
  }).lean();

  const nextVersion = (current?.version || 0) + 1;
  const updated = await TicketSlaPolicy.findOneAndUpdate(
    { buildingId: new Types.ObjectId(user.buildingId) },
    {
      $set: {
        ...parsed.data,
        version: nextVersion,
        updatedBy: new Types.ObjectId(user.id),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'ticket_sla_policy_updated',
    entityType: 'building',
    entityId: user.buildingId,
    before: current || undefined,
    after: updated || undefined,
    metadata: { version: nextVersion },
  });

  return successResponse(updated);
});
