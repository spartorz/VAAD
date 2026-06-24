import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { sendBatchItems } from '@/lib/notifications/send-service';

const sendSchema = z.object({
  dryRun: z.boolean().default(false),
});

/**
 * POST /api/notifications/batches/[batchId]/send
 *
 * Triggers provider-based sending for all eligible items in an approved
 * whatsapp_api batch. Only items with status = 'pending' are processed;
 * already-sent items are silently skipped (idempotent).
 *
 * ── Prerequisites ─────────────────────────────────────────────────────────────
 *  - Batch must belong to the requesting user's building
 *  - Batch channel must be 'whatsapp_api'
 *  - Batch status must be 'ready' or 'approved'
 *  - WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID must be set (unless dryRun)
 *
 * ── Body ─────────────────────────────────────────────────────────────────────
 *  { "dryRun": false }  — set true to simulate without making real API calls
 *
 * ── Response ─────────────────────────────────────────────────────────────────
 *  { attempted, sent, failed, skipped, dryRun, items[] }
 */
export const POST = withAuth(
  async (request: NextRequest, { user, params }) => {
    const batchId = params?.batchId;
    if (!batchId) return errorResponse('Missing batchId', 400);

    const body = await request.json().catch(() => ({}));
    const parsed = sendSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.errors.map((e) => e.message).join(', '), 400);
    }

    const { dryRun } = parsed.data;

    try {
      const result = await sendBatchItems({
        batchId,
        buildingId: user.buildingId,
        triggeredBy: user.id,
        triggeredByName: user.name,
        dryRun,
      });

      return successResponse(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Send failed';
      return errorResponse(message, 400);
    }
  },
  { requiredRole: 'BOARD' }
);
