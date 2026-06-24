import mongoose, { Schema, Document, Model } from 'mongoose';
import { BankInfo, BuildingSettings, BuildingCounters } from '@/lib/types';

export interface IBuilding extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  address: string;
  city: string;
  country: string;
  timezone: string;
  bankInfo?: BankInfo;
  settings: BuildingSettings;
  counters: BuildingCounters;
  createdAt: Date;
  updatedAt: Date;
}

const buildingSchema = new Schema<IBuilding>(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    timezone: { type: String, default: 'Asia/Jerusalem' },
    bankInfo: {
      bankName: String,
      accountNumber: String,
      routingNumber: String,
      notes: String,
    },
    settings: {
      currency: { type: String, default: 'ILS' },
      dueDay: { type: Number, default: 10, min: 1, max: 28 },
      monthlyDueAmount: Number,
      invoicePrefix: { type: String, default: 'INV' },
    },
    counters: {
      invoiceNextNumber: { type: Number, default: 1 },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
buildingSchema.index({ name: 1 });
buildingSchema.index({ city: 1, country: 1 });

const Building: Model<IBuilding> = mongoose.models.Building || mongoose.model<IBuilding>('Building', buildingSchema);

export default Building;

