import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import { NotificationChannel, NotificationType } from '@/lib/types';

/**
 * Maps VAAD internal variable names to positional parameters in a Meta-approved
 * WhatsApp Business template component.
 *
 * variableNames[0] → {{1}}, variableNames[1] → {{2}}, etc.
 */
export interface WhatsAppComponentMapping {
  type: 'header' | 'body' | 'button';
  variableNames: string[];
}

export interface INotificationTemplate extends Document {
  _id: Types.ObjectId;
  buildingId: Types.ObjectId;
  type: NotificationType;
  channel: NotificationChannel;
  /** Admin-visible label, e.g. "תזכורת תשלום — ברירת מחדל" */
  name: string;
  /**
   * Message body with {{variable}} placeholders.
   * Allowed: residentName, apartmentNumber, monthLabel, balanceAmount,
   *          buildingName, reference, invoiceUrl
   */
  body: string;
  /** Optional subject line for email channel */
  subject?: string;
  /** Variables actually present in the body — extracted at save time */
  variables: string[];
  /** One default per (buildingId, type, channel) — enforced at service layer */
  isDefault: boolean;
  isActive: boolean;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;

  // ── WhatsApp Business API template binding (channel = 'whatsapp_api') ────────
  /** Exact template name as registered in Meta Business Manager, e.g. "payment_reminder" */
  whatsappTemplateName?: string;
  /** IETF language code for the approved template, e.g. "he" */
  whatsappLanguageCode?: string;
  /**
   * Maps VAAD variable names → Meta template positional parameters.
   * Required when whatsappTemplateName is set and the template uses variables.
   */
  whatsappComponents?: WhatsAppComponentMapping[];
}

const notificationTemplateSchema = new Schema<INotificationTemplate>(
  {
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
    type: {
      type: String,
      enum: ['payment_reminder'] satisfies NotificationType[],
      required: true,
    },
    channel: {
      type: String,
      enum: ['whatsapp_manual', 'whatsapp_api', 'email', 'sms'] satisfies NotificationChannel[],
      required: true,
    },
    name: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    subject: { type: String },
    variables: [{ type: String }],
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    // WhatsApp Business API template binding
    whatsappTemplateName: { type: String, trim: true },
    whatsappLanguageCode: { type: String, trim: true },
    whatsappComponents: [
      {
        type: { type: String, enum: ['header', 'body', 'button'] },
        variableNames: [{ type: String }],
        _id: false,
      },
    ],
  },
  { timestamps: true }
);

// Fast default template lookup
notificationTemplateSchema.index({ buildingId: 1, type: 1, channel: 1, isDefault: 1 });
notificationTemplateSchema.index({ buildingId: 1, type: 1, channel: 1, isActive: 1 });

const NotificationTemplate: Model<INotificationTemplate> =
  mongoose.models.NotificationTemplate ||
  mongoose.model<INotificationTemplate>('NotificationTemplate', notificationTemplateSchema);

export default NotificationTemplate;
