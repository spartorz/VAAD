import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import { VendorCategory } from '@/lib/types';

export interface IVendor extends Document {
  _id: Types.ObjectId;
  buildingId: Types.ObjectId;
  name: string;
  phone?: string;
  email?: string;
  category: VendorCategory;
  contractStart?: Date;
  contractEnd?: Date;
  notes?: string;
  documents: Array<{ url: string; name: string }>;
  isActive: boolean;
  serviceTypes?: string[];
  slaTier?: 'standard' | 'priority' | 'critical';
  contactHours?: string;
  rating?: number;
  createdAt: Date;
  updatedAt: Date;
}

const vendorSchema = new Schema<IVendor>(
  {
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    category: { 
      type: String, 
      enum: ['cleaning', 'elevator', 'electric', 'plumbing', 'security', 'landscaping', 'other'],
      required: true 
    },
    contractStart: Date,
    contractEnd: Date,
    notes: String,
    isActive: { type: Boolean, default: true },
    serviceTypes: { type: [String], default: [] },
    slaTier: { type: String, enum: ['standard', 'priority', 'critical'] },
    contactHours: { type: String, trim: true },
    rating: { type: Number, min: 0, max: 5 },
    documents: [{
      url: { type: String, required: true },
      name: { type: String, required: true },
    }],
  },
  {
    timestamps: true,
  }
);

// Indexes
vendorSchema.index({ buildingId: 1, category: 1 });
vendorSchema.index({ buildingId: 1, name: 1 });
vendorSchema.index({ buildingId: 1, isActive: 1 });

const Vendor: Model<IVendor> = mongoose.models.Vendor || mongoose.model<IVendor>('Vendor', vendorSchema);

export default Vendor;

