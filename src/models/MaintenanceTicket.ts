import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import { TicketPriority, TicketStatus, FileAttachment, TimelineComment } from '@/lib/types';

export interface IMaintenanceTicket extends Document {
  _id: Types.ObjectId;
  buildingId: Types.ObjectId;
  apartmentId?: Types.ObjectId;
  createdBy: Types.ObjectId;
  title: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  vendorId?: Types.ObjectId;
  attachments: FileAttachment[];
  timeline: TimelineComment[];
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  // Closure fields
  closedAt?: Date;
  closedByUserId?: Types.ObjectId;
  resolutionNotes?: string;
  invoiceDocumentId?: Types.ObjectId;
  invoiceNumber?: string;
  invoiceDate?: Date;
  costAmount?: number;
  costCurrency?: string;
  responseDueAt?: Date;
  resolutionDueAt?: Date;
  firstAssignedAt?: Date;
  firstInProgressAt?: Date;
  responseMet?: boolean;
  resolutionMet?: boolean;
  slaBreached?: boolean;
  slaBreachReason?: string;
  slaSource?: string;
  slaPolicyVersion?: number;
}

const attachmentSchema = new Schema({
  url: { type: String, required: true },
  name: { type: String, required: true },
  type: String,
  size: { type: Number, required: true },
}, { _id: false });

const commentSchema = new Schema({
  byUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  byUserName: String,
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const maintenanceTicketSchema = new Schema<IMaintenanceTicket>(
  {
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
    apartmentId: { type: Schema.Types.ObjectId, ref: 'Apartment', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    priority: { 
      type: String, 
      enum: ['low', 'medium', 'high', 'urgent'], 
      default: 'medium' 
    },
    status: { 
      type: String, 
      enum: ['open', 'in_progress', 'waiting_vendor', 'resolved', 'closed'], 
      default: 'open' 
    },
    vendorId: { type: Schema.Types.ObjectId, ref: 'Vendor' },
    attachments: [attachmentSchema],
    timeline: [commentSchema],
    resolvedAt: Date,
    // Closure fields
    closedAt: Date,
    closedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    resolutionNotes: { type: String, maxlength: 2000 },
    invoiceDocumentId: { type: Schema.Types.ObjectId, ref: 'Document' },
    invoiceNumber: { type: String, trim: true, maxlength: 120 },
    invoiceDate: Date,
    costAmount: { type: Number, min: 0 },
    costCurrency: { type: String, default: 'ILS' },
    responseDueAt: Date,
    resolutionDueAt: Date,
    firstAssignedAt: Date,
    firstInProgressAt: Date,
    responseMet: Boolean,
    resolutionMet: Boolean,
    slaBreached: Boolean,
    slaBreachReason: String,
    slaSource: String,
    slaPolicyVersion: Number,
  },
  {
    timestamps: true,
  }
);

// Indexes
maintenanceTicketSchema.index({ buildingId: 1, status: 1 });
maintenanceTicketSchema.index({ buildingId: 1, priority: 1 });
maintenanceTicketSchema.index({ buildingId: 1, createdAt: -1 });
maintenanceTicketSchema.index({ buildingId: 1, apartmentId: 1 });

const MaintenanceTicket: Model<IMaintenanceTicket> = 
  mongoose.models.MaintenanceTicket || mongoose.model<IMaintenanceTicket>('MaintenanceTicket', maintenanceTicketSchema);

export default MaintenanceTicket;

