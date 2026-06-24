import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import { NotificationChannel, NotificationReminderMode } from '@/lib/types';

export interface INotificationSettings extends Document {
  _id: Types.ObjectId;
  /** One settings document per building */
  buildingId: Types.ObjectId;
  /** Master switch for payment reminders */
  paymentRemindersEnabled: boolean;
  /** Operational mode — default manual_only (human always in the loop) */
  reminderMode: NotificationReminderMode;
  /** Day of month to generate reminders (1–28), used when mode is not manual_only */
  reminderDayOfMonth: number;
  /** Days after due date before sending reminders */
  gracePeriodDays: number;
  /**
   * Minimum days between contacting the same apartment.
   * Apartments last contacted within this window are skipped/flagged.
   */
  cooldownDays: number;
  /** When true, batches land in ready_for_review and need explicit approval */
  requireApprovalBeforeSending: boolean;
  /** When true, apartments last contacted within cooldownDays are skipped */
  skipRecentlyContactedResidents: boolean;
  /** Channels this building has enabled */
  activeChannels: NotificationChannel[];
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSettingsSchema = new Schema<INotificationSettings>(
  {
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, unique: true },
    paymentRemindersEnabled: { type: Boolean, default: true },
    reminderMode: {
      type: String,
      enum: ['manual_only', 'scheduled_review', 'fully_automatic'] satisfies NotificationReminderMode[],
      default: 'manual_only',
    },
    reminderDayOfMonth: { type: Number, default: 5, min: 1, max: 28 },
    gracePeriodDays: { type: Number, default: 5, min: 0 },
    cooldownDays: { type: Number, default: 14, min: 1 },
    requireApprovalBeforeSending: { type: Boolean, default: false },
    skipRecentlyContactedResidents: { type: Boolean, default: true },
    activeChannels: {
      type: [String],
      enum: ['whatsapp_manual', 'whatsapp_api', 'email', 'sms'],
      default: ['whatsapp_manual'],
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const NotificationSettings: Model<INotificationSettings> =
  mongoose.models.NotificationSettings ||
  mongoose.model<INotificationSettings>('NotificationSettings', notificationSettingsSchema);

export default NotificationSettings;
