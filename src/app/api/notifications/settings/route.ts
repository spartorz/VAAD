import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import { getOrCreateSettings } from '@/lib/notifications/batch-service';
import NotificationSettings from '@/models/NotificationSettings';
import Building from '@/models/Building';
import { Types } from 'mongoose';

const updateSettingsSchema = z.object({
  paymentRemindersEnabled: z.boolean().optional(),
  reminderMode: z.enum(['manual_only', 'scheduled_review', 'fully_automatic']).optional(),
  reminderDayOfMonth: z.number().int().min(1).max(28).optional(),
  gracePeriodDays: z.number().int().min(0).optional(),
  cooldownDays: z.number().int().min(1).max(365).optional(),
  requireApprovalBeforeSending: z.boolean().optional(),
  skipRecentlyContactedResidents: z.boolean().optional(),
  activeChannels: z
    .array(z.enum(['whatsapp_manual', 'whatsapp_api', 'email', 'sms']))
    .min(1)
    .optional(),
});

// GET /api/notifications/settings
export const GET = withAuth(
  async (_request: NextRequest, { user }) => {
    const [settings, building] = await Promise.all([
      getOrCreateSettings(user.buildingId),
      Building.findById(user.buildingId).select('timezone').lean(),
    ]);
    return successResponse({
      ...settings.toObject(),
      buildingTimezone: building?.timezone ?? 'Asia/Jerusalem',
    });
  },
  { requiredRole: 'BOARD' }
);

// PUT /api/notifications/settings
export const PUT = withAuth(
  async (request: NextRequest, { user }) => {
    const body = await request.json().catch(() => null);
    if (!body) return errorResponse('Invalid JSON body', 400);

    const parsed = updateSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.errors.map((e) => e.message).join(', '), 400);
    }

    const data = parsed.data;
    const settings = await getOrCreateSettings(user.buildingId);

    // Apply changes
    if (data.paymentRemindersEnabled !== undefined) settings.paymentRemindersEnabled = data.paymentRemindersEnabled;
    if (data.reminderMode !== undefined) settings.reminderMode = data.reminderMode;
    if (data.reminderDayOfMonth !== undefined) settings.reminderDayOfMonth = data.reminderDayOfMonth;
    if (data.gracePeriodDays !== undefined) settings.gracePeriodDays = data.gracePeriodDays;
    if (data.cooldownDays !== undefined) settings.cooldownDays = data.cooldownDays;
    if (data.requireApprovalBeforeSending !== undefined) settings.requireApprovalBeforeSending = data.requireApprovalBeforeSending;
    if (data.skipRecentlyContactedResidents !== undefined) settings.skipRecentlyContactedResidents = data.skipRecentlyContactedResidents;
    if (data.activeChannels !== undefined) settings.activeChannels = data.activeChannels;

    settings.updatedBy = new Types.ObjectId(user.id);
    await settings.save();

    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'notification_settings_updated',
      entityType: 'notification_settings',
      entityId: settings._id.toString(),
      metadata: { updatedFields: Object.keys(data) },
    });

    return successResponse(settings);
  },
  { requiredRole: 'BOARD' }
);
