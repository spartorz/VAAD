import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import {
  NotificationChannel,
  NotificationType,
  NotificationBatchStatus,
} from '@/lib/types';

export interface INotificationBatch extends Document {
  _id: Types.ObjectId;
  buildingId: Types.ObjectId;
  type: NotificationType;
  /** YYYY-MM — required for payment_reminder batches */
  month: string;
  title: string;
  /** Identifies the message template key, e.g. 'payment_reminder_whatsapp_he_v1' */
  messageTemplate: string;
  /** Reference to a NotificationTemplate doc — present when a DB template was used */
  templateId?: Types.ObjectId;
  /**
   * Custom message body override — stored when an admin provided free text.
   * When set, isCustomMessage = true and templateId may still reference the base template.
   */
  customMessage?: string;
  isCustomMessage: boolean;
  channel: NotificationChannel;
  audienceSummary: {
    total: number;
    unpaid: number;
    partial: number;
  };
  createdBy: Types.ObjectId;
  /** Set when batch was explicitly approved */
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  status: NotificationBatchStatus;
  stats: {
    total: number;
    pending: number;
    openedManual: number;
    retrying: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    cancelled: number;
  };
  /** Number of recipients skipped at generation time */
  skippedCount: number;
  skippedSummary: {
    noPhone: number;
    recentlyContacted: number;
    /** Apartments explicitly excluded by admin during manual targeting */
    manuallyExcluded: number;
    total: number;
  };
  /** 'automatic' = all eligible apartments were targeted; 'manual' = admin-selected subset */
  targetingMode: 'automatic' | 'manual';
  createdAt: Date;
  updatedAt: Date;
}

const notificationBatchSchema = new Schema<INotificationBatch>(
  {
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
    type: {
      type: String,
      enum: ['payment_reminder'] satisfies NotificationType[],
      required: true,
    },
    month: { type: String, required: true },
    title: { type: String, required: true },
    messageTemplate: { type: String, required: true },
    templateId: { type: Schema.Types.ObjectId, ref: 'NotificationTemplate' },
    customMessage: { type: String },
    isCustomMessage: { type: Boolean, default: false },
    channel: {
      type: String,
      enum: ['whatsapp_manual', 'whatsapp_api', 'email', 'sms'] satisfies NotificationChannel[],
      required: true,
    },
    audienceSummary: {
      total: { type: Number, default: 0 },
      unpaid: { type: Number, default: 0 },
      partial: { type: Number, default: 0 },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    status: {
      type: String,
      enum: [
        'draft', 'ready_for_review', 'approved', 'ready',
        'processing', 'completed', 'failed', 'cancelled',
      ] satisfies NotificationBatchStatus[],
      default: 'ready',
    },
    stats: {
      total: { type: Number, default: 0 },
      pending: { type: Number, default: 0 },
      openedManual: { type: Number, default: 0 },
      retrying: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      read: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      cancelled: { type: Number, default: 0 },
    },
    skippedCount: { type: Number, default: 0 },
    skippedSummary: {
      noPhone: { type: Number, default: 0 },
      recentlyContacted: { type: Number, default: 0 },
      manuallyExcluded: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
    targetingMode: { type: String, enum: ['automatic', 'manual'], default: 'automatic' },
  },
  { timestamps: true }
);

// Lookup: find active batches for a building × type × month × channel
notificationBatchSchema.index({ buildingId: 1, type: 1, month: 1, channel: 1 });
notificationBatchSchema.index({ buildingId: 1, status: 1, createdAt: -1 });

const NotificationBatch: Model<INotificationBatch> =
  mongoose.models.NotificationBatch ||
  mongoose.model<INotificationBatch>('NotificationBatch', notificationBatchSchema);

export default NotificationBatch;
