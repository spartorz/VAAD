import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import {
  NotificationChannel,
  NotificationFailureReason,
  NotificationType,
  NotificationItemStatus,
  NotificationSkipReason,
} from '@/lib/types';

export interface INotificationItem extends Document {
  _id: Types.ObjectId;
  buildingId: Types.ObjectId;
  batchId: Types.ObjectId;
  residentId?: Types.ObjectId;
  apartmentId?: Types.ObjectId;
  /** Normalized phone (no spaces, with country code, no leading +) */
  phone?: string;
  email?: string;
  channel: NotificationChannel;
  type: NotificationType;
  /** Fully-rendered message for this specific recipient */
  renderedMessage: string;
  status: NotificationItemStatus;
  retryCount: number;
  maxRetries: number;
  lastAttemptAt?: Date;
  sentAt?: Date;
  queuedAt?: Date;
  /** Safe failure reason — must never contain sensitive data */
  failureReason?: string;
  /** Structured failure code for analytics/filtering */
  failureCode?: NotificationFailureReason;
  /** When status = 'cancelled' at generation time, explains why this item was skipped */
  skipReason?: NotificationSkipReason;
  /** When was this apartment last successfully contacted (for cooldown display in review UI) */
  recentContactAt?: Date;
  /** Provider identifier, e.g. 'manual', 'whatsapp_business', 'resend' */
  provider?: string;
  /** External provider message/request ID for tracing (e.g. Meta wamid) */
  providerMessageId?: string;
  /** Timestamp when provider confirmed delivery to the recipient's device */
  deliveredAt?: Date;
  /** Timestamp when provider confirmed the message was read */
  readAt?: Date;
  failedAt?: Date;
  lastRetryAt?: Date;
  retryHistory?: Array<{
    attempt: number;
    timestamp: Date;
    result: 'started' | 'completed' | 'failed';
    reason?: string;
  }>;
  /** Additional context stored at creation — apartment number, amount, reference, etc. */
  metadata?: Record<string, unknown>;
  /**
   * Records the WhatsApp Business template name that was used to send this item
   * (channel = 'whatsapp_api' only). Stored for compliance audit.
   */
  whatsappTemplateName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const notificationItemSchema = new Schema<INotificationItem>(
  {
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'NotificationBatch', required: true, index: true },
    residentId: { type: Schema.Types.ObjectId, ref: 'Resident' },
    apartmentId: { type: Schema.Types.ObjectId, ref: 'Apartment', index: true },
    phone: { type: String },
    email: { type: String },
    channel: {
      type: String,
      enum: ['whatsapp_manual', 'whatsapp_api', 'email', 'sms'] satisfies NotificationChannel[],
      required: true,
    },
    type: {
      type: String,
      enum: ['payment_reminder'] satisfies NotificationType[],
      required: true,
    },
    renderedMessage: { type: String, required: true },
    status: {
      type: String,
      enum: [
        'draft',
        'pending',
        'queued',
        'sent',
        'delivered',
        'read',
        'opened_manual',
        'retrying',
        'failed',
        'cancelled',
      ] satisfies NotificationItemStatus[],
      default: 'pending',
    },
    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 3 },
    lastAttemptAt: { type: Date },
    queuedAt: { type: Date },
    sentAt: { type: Date },
    failureReason: { type: String },
    failureCode: {
      type: String,
      enum: [
        'invalid_phone',
        'provider_error',
        'rate_limited',
        'blocked_by_user',
        'unknown',
      ] satisfies NotificationFailureReason[],
    },
    skipReason: {
      type: String,
      enum: [
        'no_phone',
        'recently_contacted',
        'inactive_resident',
        'manually_excluded',
        'no_consent',
      ] satisfies NotificationSkipReason[],
    },
    whatsappTemplateName: { type: String },
    recentContactAt: { type: Date },
    provider: { type: String },
    providerMessageId: { type: String, index: true }, // indexed for fast webhook lookups
    deliveredAt: { type: Date },
    readAt: { type: Date },
    failedAt: { type: Date },
    lastRetryAt: { type: Date },
    retryHistory: [
      {
        _id: false,
        attempt: { type: Number, required: true, min: 1 },
        timestamp: { type: Date, required: true },
        result: {
          type: String,
          enum: ['started', 'completed', 'failed'],
          required: true,
        },
        reason: { type: String },
      },
    ],
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

// One item per apartment per batch
notificationItemSchema.index({ batchId: 1, apartmentId: 1 }, { unique: true, sparse: true });
notificationItemSchema.index({ buildingId: 1, status: 1 });
notificationItemSchema.index({ batchId: 1, status: 1 });
notificationItemSchema.index({ buildingId: 1, failureCode: 1, status: 1 });
// Cooldown check: find recent contacts for an apartment
notificationItemSchema.index({ buildingId: 1, apartmentId: 1, lastAttemptAt: -1 });

const NotificationItem: Model<INotificationItem> =
  mongoose.models.NotificationItem ||
  mongoose.model<INotificationItem>('NotificationItem', notificationItemSchema);

export default NotificationItem;
