import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import NotificationTemplate from '@/models/NotificationTemplate';
import { validateTemplateBody, extractUsedVariables } from '@/lib/notifications/template-renderer';
import { Types } from 'mongoose';

const whatsappComponentSchema = z.object({
  type: z.enum(['header', 'body', 'button']),
  variableNames: z.array(z.string().max(50)).max(10),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  body: z.string().min(10).max(2000).optional(),
  subject: z.string().max(200).optional().nullable(),
  isActive: z.boolean().optional(),
  // WhatsApp Business API template binding (channel = 'whatsapp_api')
  whatsappTemplateName: z.string().max(100).optional().nullable(),
  whatsappLanguageCode: z.string().max(20).optional().nullable(),
  whatsappComponents: z.array(whatsappComponentSchema).max(5).optional().nullable(),
});

// GET /api/notifications/templates/[templateId]
export const GET = withAuth(
  async (_request: NextRequest, { user, params }) => {
    const templateId = params?.templateId;
    if (!templateId || !Types.ObjectId.isValid(templateId)) {
      return errorResponse('Invalid template ID', 400);
    }

    const template = await NotificationTemplate.findOne({
      _id: new Types.ObjectId(templateId),
      buildingId: new Types.ObjectId(user.buildingId),
    }).lean();

    if (!template) return errorResponse('Template not found', 404);

    return successResponse(template);
  },
  { requiredRole: 'BOARD' }
);

// PUT /api/notifications/templates/[templateId]
export const PUT = withAuth(
  async (request: NextRequest, { user, params }) => {
    const templateId = params?.templateId;
    if (!templateId || !Types.ObjectId.isValid(templateId)) {
      return errorResponse('Invalid template ID', 400);
    }

    const body = await request.json().catch(() => null);
    if (!body) return errorResponse('Invalid JSON body', 400);

    const parsed = updateTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.errors.map((e) => e.message).join(', '), 400);
    }

    const template = await NotificationTemplate.findOne({
      _id: new Types.ObjectId(templateId),
      buildingId: new Types.ObjectId(user.buildingId),
    });

    if (!template) return errorResponse('Template not found', 404);

    const data = parsed.data;

    if (data.body !== undefined) {
      const validation = validateTemplateBody(data.body);
      if (!validation.valid) {
        return errorResponse(
          `Template uses unknown variables: ${validation.unknownVariables.join(', ')}`,
          400
        );
      }
      template.body = data.body;
      template.variables = extractUsedVariables(data.body);
    }

    if (data.name !== undefined) template.name = data.name;
    if (data.subject !== undefined) template.subject = data.subject ?? undefined;
    if (data.isActive !== undefined) template.isActive = data.isActive;
    // WhatsApp Business API template binding
    if (data.whatsappTemplateName !== undefined) {
      template.whatsappTemplateName = data.whatsappTemplateName ?? undefined;
    }
    if (data.whatsappLanguageCode !== undefined) {
      template.whatsappLanguageCode = data.whatsappLanguageCode ?? undefined;
    }
    if (data.whatsappComponents !== undefined) {
      template.whatsappComponents = data.whatsappComponents ?? undefined;
    }
    template.updatedBy = new Types.ObjectId(user.id);

    await template.save();

    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'notification_template_updated',
      entityType: 'notification_template',
      entityId: templateId,
      metadata: { updatedFields: Object.keys(data) },
    });

    return successResponse(template);
  },
  { requiredRole: 'BOARD' }
);
