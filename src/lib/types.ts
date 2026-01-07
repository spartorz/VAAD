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

// Audit Action Types
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
  | 'invoice_view'
  | 'invoice_download'
  | 'invoice_issued'
  | 'invoice_pdf_download';

// Audit Entity Types
export type AuditEntityType = 
  | 'charge' 
  | 'payment' 
  | 'ticket' 
  | 'document' 
  | 'resident' 
  | 'apartment'
  | 'vendor' 
  | 'building'
  | 'user';

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

