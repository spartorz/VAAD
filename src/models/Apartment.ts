import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import { ApartmentStatus } from '@/lib/types';

export interface IApartment extends Document {
  _id: Types.ObjectId;
  buildingId: Types.ObjectId;
  number: string;
  floor?: number;
  size?: number;
  status: ApartmentStatus;
  createdAt: Date;
  updatedAt: Date;
}

const apartmentSchema = new Schema<IApartment>(
  {
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
    number: { type: String, required: true, trim: true },
    floor: { type: Number },
    size: { type: Number },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
apartmentSchema.index({ buildingId: 1, number: 1 }, { unique: true });
apartmentSchema.index({ buildingId: 1, status: 1 });

const Apartment: Model<IApartment> = mongoose.models.Apartment || mongoose.model<IApartment>('Apartment', apartmentSchema);

export default Apartment;

