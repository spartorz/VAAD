import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import { AuditAction, AuditEntityType } from '@/lib/types';

export interface IAuditLog extends Document {
  _id: Types.ObjectId;
  buildingId: Types.ObjectId;
  actorUserId: Types.ObjectId;
  actorName?: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: Types.ObjectId;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actorName: String,
    action: { 
      type: String, 
      enum: ['create', 'update', 'void', 'delete', 'login', 'generate_charges', 'import_data'],
      required: true 
    },
    entityType: { 
      type: String, 
      enum: ['charge', 'payment', 'ticket', 'document', 'resident', 'apartment', 'vendor', 'building', 'user'],
      required: true 
    },
    entityId: { type: Schema.Types.ObjectId, required: true },
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

