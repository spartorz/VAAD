import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import Apartment from '@/models/Apartment';
import { Types } from 'mongoose';
import { z } from 'zod';

const logSchema = z.object({
  chargeId: z.string().optional(),
  apartmentId: z.string(),
  apartmentNumber: z.string(),
  period: z.string(),
  amount: z.number(),
  reference: z.string(),
  invoiceUrl: z.string(),
  residentName: z.string().optional(),
  phone: z.string().optional(),
  source: z.enum(['notifications_page', 'row_action', 'bulk_send']),
});

// POST /api/notifications/log - Log WhatsApp notification open
export const POST = withAuth(async (request: NextRequest, { user }) => {
  try {
    const body = await request.json();
    
    // Validate request body
    const result = logSchema.safeParse(body);
    if (!result.success) {
      return errorResponse(`Invalid request: ${result.error.errors.map(e => e.message).join(', ')}`, 400);
    }

    const {
      chargeId,
      apartmentId,
      apartmentNumber,
      period,
      amount,
      reference,
      invoiceUrl,
      residentName,
      phone,
      source,
    } = result.data;

    const buildingId = new Types.ObjectId(user.buildingId);

    // Verify apartment belongs to the same building (if provided)
    if (apartmentId) {
      const apartment = await Apartment.findById(apartmentId).lean();
      if (!apartment) {
        return errorResponse('Apartment not found', 404);
      }
      if (apartment.buildingId.toString() !== buildingId.toString()) {
        return errorResponse('Apartment does not belong to this building', 403);
      }
    }

    // Create audit log entry
    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'notification_open_whatsapp',
      entityType: 'apartment',
      entityId: apartmentId,
      metadata: {
        period,
        apartmentId,
        apartmentNumber,
        residentName: residentName || undefined,
        phone: phone ? `***${phone.slice(-4)}` : undefined, // Mask phone, keep last 4 digits
        amount,
        reference,
        invoiceUrl,
        source,
        chargeId: chargeId || undefined,
      },
    });

    return successResponse({ ok: true });
  } catch (error) {
    console.error('Error logging notification:', error);
    return errorResponse('Failed to log notification', 500);
  }
}, { requiredRole: 'TREASURER' });

