import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import NotificationTemplate from '@/models/NotificationTemplate';
import { Types } from 'mongoose';

// POST /api/notifications/templates/[templateId]/set-default
export const POST = withAuth(
  async (_request: NextRequest, { user, params }) => {
    const templateId = params?.templateId;
    if (!templateId || !Types.ObjectId.isValid(templateId)) {
      return errorResponse('Invalid template ID', 400);
    }

    const template = await NotificationTemplate.findOne({
      _id: new Types.ObjectId(templateId),
      buildingId: new Types.ObjectId(user.buildingId),
      isActive: true,
    });

    if (!template) return errorResponse('Template not found or inactive', 404);

    // Clear existing defaults for same building/type/channel
    await NotificationTemplate.updateMany(
      {
        buildingId: new Types.ObjectId(user.buildingId),
        type: template.type,
        channel: template.channel,
        isDefault: true,
        _id: { $ne: template._id },
      },
      { $set: { isDefault: false } }
    );

    template.isDefault = true;
    template.updatedBy = new Types.ObjectId(user.id);
    await template.save();

    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'notification_template_updated',
      entityType: 'notification_template',
      entityId: templateId,
      metadata: { action: 'set_default', type: template.type, channel: template.channel },
    });

    return successResponse({ ok: true });
  },
  { requiredRole: 'BOARD' }
);
