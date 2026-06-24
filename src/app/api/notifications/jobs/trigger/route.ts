import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import {
  jobGeneratePaymentReminderBatch,
  jobRetryFailedItems,
  JOB_NAMES,
} from '@/lib/notifications/job-service';
import Building from '@/models/Building';

const triggerSchema = z.discriminatedUnion('job', [
  z.object({
    job: z.literal('generate_payment_reminder_batch'),
    month: z.string().regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM'),
    force: z.boolean().default(false),
  }),
  z.object({
    job: z.literal('retry_failed_items'),
    batchId: z.string(),
  }),
]);

/**
 * POST /api/notifications/jobs/trigger
 *
 * Admin-only manual trigger for notification jobs.
 * Serves as a fallback until a true cron scheduler is in place.
 */
export const POST = withAuth(
  async (request: NextRequest, { user }) => {
    const body = await request.json().catch(() => null);
    if (!body) return errorResponse('Invalid JSON body', 400);

    const parsed = triggerSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        `Invalid payload: ${parsed.error.errors.map((e) => e.message).join(', ')}`,
        400
      );
    }

    const payload = parsed.data;
    let result;

    switch (payload.job) {
      case 'generate_payment_reminder_batch': {
        const building = await Building.findById(user.buildingId).lean();
        if (!building) return errorResponse('Building not found', 404);

        result = await jobGeneratePaymentReminderBatch({
          buildingId: user.buildingId,
          buildingName: building.name,
          month: payload.month,
          createdBy: user.id,
          force: payload.force,
        });
        break;
      }

      case 'retry_failed_items': {
        result = await jobRetryFailedItems({ batchId: payload.batchId });
        break;
      }

      default: {
        return errorResponse(`Unknown job. Valid jobs: ${JOB_NAMES.join(', ')}`, 400);
      }
    }

    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'notification_batch_created',
      entityType: 'notification_batch',
      entityId: user.buildingId,
      metadata: { trigger: 'manual_admin', jobResult: result },
    });

    if (result.status === 'error') {
      return errorResponse(result.message, 500);
    }

    return successResponse(result);
  },
  { requiredRole: 'ADMIN' }
);
