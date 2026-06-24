import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import { AuditAction, AuditEntityType } from '@/lib/types';

export interface IAuditLog extends Document {
  _id: Types.ObjectId;
  buildingId: Types.ObjectId;
  /** Optional for security events where the actor is unknown (uses sentinel OID) */
  actorUserId?: Types.ObjectId;
  actorName?: string;
  action: AuditAction;
  entityType: AuditEntityType;
  /** Optional for security events that have no natural entity (uses sentinel OID) */
  entityId?: Types.ObjectId;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
    // Not required: security events (login_failed, rate_limit_triggered) may not have a known actor
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    actorName: String,
    action: { 
      type: String, 
      enum: [
        'create', 'update', 'void', 'delete', 'login',
        'generate_charges', 'import_data', 'import_apartments', 'import_residents',
        'export_billing_monthly', 'export_apartments', 'export_residents', 'export_payments', 'export_audit',
        'whatsapp_reminder_copied', 'notification_open_whatsapp',
        'invoice_view', 'invoice_download', 'invoice_issued', 'invoice_pdf_download',
        'ticket_closed',
        // Notification engine events
        'notification_batch_created',
        'notification_item_opened_manual',
        'notification_retry_requested',
        'notification_marked_sent',
        'notification_marked_failed',
        'notification_batch_cancelled',
        'notification_batch_approved',
        'notification_template_created',
        'notification_template_updated',
        'notification_settings_updated',
        // Cron / scheduled automation events
        'notification_batch_auto_created',
        'notification_batch_auto_skipped',
        'notification_batch_already_exists',
        // Provider / WhatsApp API delivery events
        'notification_provider_send_started',
        'notification_provider_send_succeeded',
        'notification_provider_send_failed',
        'notification_webhook_received',
        'notification_delivery_updated',
        'notification_template_blocked',
        'notification_delivered',
        'notification_read',
        'notification_failed',
        'notification_retry_started',
        'notification_retry_completed',
        // Security events
        'login_success', 'login_failed', 'password_reset_requested', 'password_reset_completed', 'rate_limit_triggered',
        // Auto billing engine events
        'auto_billing_settings_updated', 'auto_billing_preview_generated', 'auto_billing_run_started',
        'auto_billing_charges_generated', 'auto_billing_skipped', 'auto_billing_failed',
        // Tickets / vendor SLA events
        'ticket_vendor_assigned', 'ticket_vendor_unassigned', 'ticket_sla_policy_updated',
        'vendor_deactivated', 'ticket_sla_breached',
        'ticket_invoice_uploaded', 'ticket_invoice_attached', 'ticket_invoice_replaced',
        'report_exported',
      ],
      required: true 
    },
    entityType: { 
      type: String, 
      enum: [
        'charge', 'payment', 'ticket', 'document', 'resident', 'apartment',
        'vendor', 'building', 'user', 'security_event',
        'notification_batch', 'notification_item',
        'notification_template', 'notification_settings',
      ],
      required: true 
    },
    // Not required: security events may not map to a specific entity
    entityId: { type: Schema.Types.ObjectId },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    metadata: { type: Schema.Types.Mixed },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Immutable
  }
);

// Indexes for efficient querying
auditLogSchema.index({ buildingId: 1, createdAt: -1 });
auditLogSchema.index({ buildingId: 1, entityType: 1, entityId: 1 });
auditLogSchema.index({ buildingId: 1, actorUserId: 1 });
auditLogSchema.index({ buildingId: 1, action: 1 });

const AuditLog: Model<IAuditLog> = mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', auditLogSchema);

export default AuditLog;

