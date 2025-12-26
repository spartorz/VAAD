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

const Resident: Model<IResident> = mongoose.models.Resident || mongoose.model<IResident>('Resident', residentSchema);

export default Resident;

