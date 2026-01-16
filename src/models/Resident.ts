import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import { ResidentType } from '@/lib/types';

export interface IResident extends Document {
  _id: Types.ObjectId;
  buildingId: Types.ObjectId;
  apartmentId: Types.ObjectId;
  fullName: string;
  phone?: string;
  email?: string;
  type: ResidentType;
  isActive: boolean;
  moveInAt: Date;
  moveOutAt?: Date | null;
  moveOutNote?: string;
  isPrimaryContact?: boolean;
  invitationStatus?: 'pending' | 'accepted' | 'rejected' | null;
  invitedBy?: Types.ObjectId;
  invitedAt?: Date;
  rejectedAt?: Date;
  invitationToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

const residentSchema = new Schema<IResident>(
  {
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
    apartmentId: { type: Schema.Types.ObjectId, ref: 'Apartment', required: true, index: true },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    type: { type: String, enum: ['owner', 'tenant'], default: 'owner' },
    isActive: { type: Boolean, default: true },
    moveInAt: { type: Date, default: Date.now },
    moveOutAt: { type: Date, default: null },
    moveOutNote: { type: String, trim: true },
    isPrimaryContact: { type: Boolean, default: false },
    invitationStatus: { type: String, enum: ['pending', 'accepted', 'rejected'], default: null },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    invitedAt: { type: Date },
    rejectedAt: { type: Date },
    invitationToken: { type: String, trim: true, unique: true, sparse: true },
  },
  {
    timestamps: true,
  }
);

// Indexes
residentSchema.index({ buildingId: 1, apartmentId: 1 });
residentSchema.index({ buildingId: 1, email: 1 });
residentSchema.index({ buildingId: 1, isActive: 1 });
residentSchema.index({ buildingId: 1, moveInAt: -1 });
residentSchema.index({ buildingId: 1, apartmentId: 1, isActive: 1 });
residentSchema.index({ apartmentId: 1, isPrimaryContact: 1 });
residentSchema.index({ invitationToken: 1 });

const Resident: Model<IResident> = mongoose.models.Resident || mongoose.model<IResident>('Resident', residentSchema);

export default Resident;

