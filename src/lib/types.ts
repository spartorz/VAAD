import { Types } from 'mongoose';

// User Roles
export type UserRole = 'ADMIN' | 'BOARD' | 'TREASURER' | 'RESIDENT' | 'MANAGEMENT';

// Apartment Status
export type ApartmentStatus = 'active' | 'inactive';

// Resident Type
export type ResidentType = 'owner' | 'tenant';

// Charge Types
export type ChargeType = 'monthly_due' | 'one_time' | 'repair' | 'fund';

// Charge Status
export type ChargeStatus = 'open' | 'voided';

// Payment Methods
export type PaymentMethod = 'bank_transfer' | 'cash' | 'credit_card' | 'other';

// Payment Status
export type PaymentStatus = 'confirmed' | 'pending' | 'voided';

// Ticket Priority
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

// Ticket Status
export type TicketStatus = 'open' | 'in_progress' | 'waiting_vendor' | 'resolved' | 'closed';

// Vendor Category
export type VendorCategory = 'cleaning' | 'elevator' | 'electric' | 'plumbing' | 'security' | 'landscaping' | 'other';

// Document Category
export type DocumentCategory = 'insurance' | 'protocol' | 'receipt' | 'contract' | 'other';

// Document Visibility
export type DocumentVisibility = 'public' | 'residents_only' | 'board_only';

// ─── Notification Domain ───────────────────────────────────────────────────

export type NotificationChannel = 'whatsapp_manual' | 'whatsapp_api' | 'email' | 'sms';
export type NotificationType = 'payment_reminder';

/** ready_for_review = generated, awaiting explicit approval before sending
 *  approved = explicitly approved, ready to send (used when requireApprovalBeforeSending=true)
 *  ready = immediately ready to send (default when no approval required) */
export type NotificationBatchStatus =
  | 'draft'
  | 'ready_for_review'
  | 'approved'
  | 'ready'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type NotificationItemStatus =
  | 'draft'         // item created, not yet ready for delivery attempts
  | 'pending'       // waiting to be sent
  | 'queued'        // accepted by provider, wamid assigned
  | 'sent'          // delivered to Meta infrastructure (alias for queued in Meta model)
  | 'delivered'     // provider webhook confirmed delivery to device
  | 'read'          // provider webhook confirmed read by recipient
  | 'opened_manual' // admin clicked the WhatsApp link (manual channel)
  | 'retrying'      // manual/system retry requested and queued for next attempt
  | 'failed'        // provider rejected or permanent failure
  | 'cancelled';    // skipped at generation time

export type NotificationFailureReason =
  | 'invalid_phone'
  | 'provider_error'
  | 'rate_limited'
  | 'blocked_by_user'
  | 'unknown';

export type NotificationSkipReason =
  | 'no_phone'
  | 'recently_contacted'
  | 'inactive_resident'
  | 'manually_excluded'
  | 'no_consent';    // Resident has explicitly opted out of WhatsApp messages

export type NotificationReminderMode = 'manual_only' | 'scheduled_review' | 'fully_automatic';

// ─── Audit Action Types ────────────────────────────────────────────────────

export type AuditAction = 
  | 'create' 
  | 'update' 
  | 'void' 
  | 'delete'
  | 'login'
  | 'generate_charges'
  | 'import_data'
  | 'import_apartments'
  | 'import_residents'
  | 'export_billing_monthly'
  | 'export_apartments'
  | 'export_residents'
  | 'export_payments'
  | 'export_audit'
  | 'whatsapp_reminder_copied'
  | 'notification_open_whatsapp'
  | 'invoice_view'
  | 'invoice_download'
  | 'invoice_issued'
  | 'invoice_pdf_download'
  | 'ticket_closed'
  // Notification engine events
  | 'notification_batch_created'
  | 'notification_item_opened_manual'
  | 'notification_retry_requested'
  | 'notification_marked_sent'
  | 'notification_marked_failed'
  | 'notification_batch_cancelled'
  | 'notification_batch_approved'
  | 'notification_template_created'
  | 'notification_template_updated'
  | 'notification_settings_updated'
  // Cron / scheduled automation events
  | 'notification_batch_auto_created'
  | 'notification_batch_auto_skipped'
  | 'notification_batch_already_exists'
  // Provider / WhatsApp API delivery events
  | 'notification_provider_send_started'
  | 'notification_provider_send_succeeded'
  | 'notification_provider_send_failed'
  | 'notification_webhook_received'
  | 'notification_delivery_updated'
  | 'notification_template_blocked'    // send blocked: whatsapp_api template not configured
  | 'notification_delivered'
  | 'notification_read'
  | 'notification_failed'
  | 'notification_retry_started'
  | 'notification_retry_completed'
  // Security events
  | 'login_success'
  | 'login_failed'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'rate_limit_triggered'
  // Auto billing engine events
  | 'auto_billing_settings_updated'
  | 'auto_billing_preview_generated'
  | 'auto_billing_run_started'
  | 'auto_billing_charges_generated'
  | 'auto_billing_skipped'
  | 'auto_billing_failed'
  // Tickets / vendor SLA events
  | 'ticket_vendor_assigned'
  | 'ticket_vendor_unassigned'
  | 'ticket_sla_policy_updated'
  | 'vendor_deactivated'
  | 'ticket_sla_breached'
  | 'ticket_invoice_uploaded'
  | 'ticket_invoice_attached'
  | 'ticket_invoice_replaced'
  | 'report_exported';

// ─── Audit Entity Types ────────────────────────────────────────────────────

export type AuditEntityType = 
  | 'charge' 
  | 'payment' 
  | 'ticket' 
  | 'document' 
  | 'resident' 
  | 'apartment'
  | 'vendor' 
  | 'building'
  | 'user'
  | 'security_event'
  | 'notification_batch'
  | 'notification_item'
  | 'notification_template'
  | 'notification_settings';

// Settings Interface
export interface BuildingSettings {
  currency: string;
  dueDay: number;
  monthlyDueAmount?: number;
  invoicePrefix?: string;
}

// Building Counters Interface
export interface BuildingCounters {
  invoiceNextNumber: number;
}

// Bank Info Interface
export interface BankInfo {
  bankName?: string;
  accountNumber?: string; // masked
  routingNumber?: string; // masked
  notes?: string;
}

// File Attachment Interface
export interface FileAttachment {
  url: string;
  name: string;
  mimeType?: string;
  type?: string;
  size: number;
}

// Timeline Comment Interface
export interface TimelineComment {
  byUserId: Types.ObjectId;
  byUserName?: string;
  message: string;
  createdAt: Date;
}

// Session User Interface
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  buildingId: string;
  residentId?: string;
  apartmentId?: string;
}

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

