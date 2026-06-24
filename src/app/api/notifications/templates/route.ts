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

const createTemplateSchema = z.object({
  type: z.enum(['payment_reminder']),
  channel: z.enum(['whatsapp_manual', 'whatsapp_api', 'email', 'sms']),
  name: z.string().min(1).max(100),
  body: z.string().min(10).max(2000),
  subject: z.string().max(200).optional(),
  isDefault: z.boolean().default(false),
  // WhatsApp Business API template binding (channel = 'whatsapp_api')
  whatsappTemplateName: z.string().max(100).optional(),
  whatsappLanguageCode: z.string().max(20).optional(),
  whatsappComponents: z.array(whatsappComponentSchema).max(5).optional(),
});

// GET /api/notifications/templates?type=&channel=&all=true
export const GET = withAuth(
  async (request: NextRequest, { user }) => {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') ?? undefined;
    const channel = searchParams.get('channel') ?? undefined;
    // When all=true, include inactive templates (used by the management UI)
    const all = searchParams.get('all') === 'true';

    const query: Record<string, unknown> = {
      buildingId: new Types.ObjectId(user.buildingId),
    };
    if (!all) query.isActive = true;
    if (type) query.type = type;
    if (channel) query.channel = channel;

    const templates = await NotificationTemplate.find(query)
      .sort({ isDefault: -1, isActive: -1, createdAt: -1 })
      .lean();

    return successResponse(templates);
  },
  { requiredRole: 'BOARD' }
);

// POST /api/notifications/templates
export const POST = withAuth(
  async (request: NextRequest, { user }) => {
    const body = await request.json().catch(() => null);
    if (!body) return errorResponse('Invalid JSON body', 400);

    const parsed = createTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.errors.map((e) => e.message).join(', '), 400);
    }

    const data = parsed.data;

    // Validate template variable usage
    const validation = validateTemplateBody(data.body);
    if (!validation.valid) {
      return errorResponse(
        `Template uses unknown variables: ${validation.unknownVariables.join(', ')}`,
        400
      );
    }

    // Enforce single default per building/type/channel
    if (data.isDefault) {
      await NotificationTemplate.updateMany(
        {
          buildingId: new Types.ObjectId(user.buildingId),
          type: data.type,
          channel: data.channel,
          isDefault: true,
        },
        { $set: { isDefault: false } }
      );
    }

    const template = await NotificationTemplate.create({
      buildingId: new Types.ObjectId(user.buildingId),
      type: data.type,
      channel: data.channel,
      name: data.name,
      body: data.body,
      subject: data.subject,
      variables: extractUsedVariables(data.body),
      isDefault: data.isDefault,
      isActive: true,
      createdBy: new Types.ObjectId(user.id),
      // WhatsApp Business API template binding
      ...(data.whatsappTemplateName ? { whatsappTemplateName: data.whatsappTemplateName } : {}),
      ...(data.whatsappLanguageCode ? { whatsappLanguageCode: data.whatsappLanguageCode } : {}),
      ...(data.whatsappComponents?.length ? { whatsappComponents: data.whatsappComponents } : {}),
    });

    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'notification_template_created',
      entityType: 'notification_template',
      entityId: template._id.toString(),
      metadata: { name: data.name, type: data.type, channel: data.channel, isDefault: data.isDefault },
    });

    return successResponse(template, 201);
  },
  { requiredRole: 'BOARD' }
);
