import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import { generatePaymentReminderBatch } from '@/lib/notifications/batch-service';
import NotificationBatch from '@/models/NotificationBatch';
import Building from '@/models/Building';
import { Types } from 'mongoose';

const createBatchSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM'),
  channel: z
    .enum(['whatsapp_manual', 'whatsapp_api', 'email', 'sms'])
    .default('whatsapp_manual'),
  templateId: z.string().optional(),
  customMessage: z.string().max(2000).optional(),
  /**
   * Explicit apartment IDs to include. If provided, only these are targeted;
   * all other eligible apartments become manually_excluded cancelled items.
   */
  includeApartmentIds: z.array(z.string()).optional(),
  /**
   * Explicit apartment IDs to exclude from an otherwise eligible audience.
   */
  excludeApartmentIds: z.array(z.string()).optional(),
  /**
   * When true, the cooldown check is skipped for targeted apartments.
   * Requires BOARD role (already enforced by the route guard).
   */
  bypassCooldown: z.boolean().default(false),
  force: z.boolean().default(false),
});

// GET /api/notifications/batches?month=YYYY-MM&all=true&limit=N
export const GET = withAuth(
  async (request: NextRequest, { user }) => {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') ?? undefined;
    const all = searchParams.get('all') === 'true';
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '20', 10), 1), 100);

    const query: Record<string, unknown> = {
      buildingId: new Types.ObjectId(user.buildingId),
    };
    if (!all) query.status = { $ne: 'cancelled' };
    if (month) query.month = month;

    const batches = await NotificationBatch.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const enriched = batches.map((batch) => {
      const delivered = Number(batch.stats.delivered || 0);
      const read = Number(batch.stats.read || 0);
      const failed = Number(batch.stats.failed || 0);
      const sentBase = Number(batch.stats.sent || 0) + delivered + read;
      const trackedBase = sentBase + failed;

      const deliveryRate = trackedBase > 0 ? Number(((delivered / trackedBase) * 100).toFixed(1)) : 0;
      const readRate = sentBase > 0 ? Number(((read / sentBase) * 100).toFixed(1)) : 0;
      const failureRate = trackedBase > 0 ? Number(((failed / trackedBase) * 100).toFixed(1)) : 0;

      return {
        ...batch,
        analytics: {
          deliveryRate,
          readRate,
          failureRate,
        },
      };
    });

    return successResponse(enriched);
  },
  { requiredRole: 'BOARD' }
);

// POST /api/notifications/batches
export const POST = withAuth(
  async (request: NextRequest, { user }) => {
    const body = await request.json().catch(() => null);
    if (!body) return errorResponse('Invalid JSON body', 400);

    const parsed = createBatchSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => e.message).join(', '),
        400
      );
    }

    const {
      month,
      channel,
      templateId,
      customMessage,
      includeApartmentIds,
      excludeApartmentIds,
      bypassCooldown,
      force,
    } = parsed.data;

    // Fetch building name for the rendered messages
    const building = await Building.findById(user.buildingId).lean();
    if (!building) return errorResponse('Building not found', 404);

    const result = await generatePaymentReminderBatch({
      buildingId: user.buildingId,
      buildingName: building.name,
      month,
      createdBy: user.id,
      channel,
      templateId,
      customMessage,
      includeApartmentIds,
      excludeApartmentIds,
      bypassCooldown,
      force,
    });

    if (!result.created) {
      // Return existing batch with 200 — idempotent
      return successResponse({
        batch: result.batch,
        created: false,
        itemCount: result.itemCount,
        message: 'Batch already exists for this period.',
      });
    }

    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'notification_batch_created',
      entityType: 'notification_batch',
      entityId: result.batch._id.toString(),
      metadata: {
        month,
        channel,
        itemCount: result.itemCount,
        audienceSummary: result.batch.audienceSummary,
      },
    });

    return successResponse(
      { batch: result.batch, created: true, itemCount: result.itemCount },
      201
    );
  },
  { requiredRole: 'BOARD' }
);
