import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { renderPreviewMessage } from '@/lib/notifications/batch-service';
import Building from '@/models/Building';

const previewSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM'),
  templateId: z.string().optional(),
  customMessage: z.string().optional(),
  sampleApartmentId: z.string().optional(),
});

/**
 * POST /api/notifications/batches/preview
 *
 * Returns a rendered sample message without creating any records.
 * Used by the compose panel for live previews.
 */
export const POST = withAuth(
  async (request: NextRequest, { user }) => {
    const body = await request.json().catch(() => null);
    if (!body) return errorResponse('Invalid JSON body', 400);

    const parsed = previewSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.errors.map((e) => e.message).join(', '), 400);
    }

    const { month, templateId, customMessage, sampleApartmentId } = parsed.data;

    const building = await Building.findById(user.buildingId).lean();
    if (!building) return errorResponse('Building not found', 404);

    const renderedMessage = await renderPreviewMessage({
      buildingId: user.buildingId,
      buildingName: building.name,
      month,
      templateId,
      customMessage,
      sampleApartmentId,
    });

    return successResponse({ renderedMessage });
  },
  { requiredRole: 'BOARD' }
);
