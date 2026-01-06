import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import { ChargeType, ChargeStatus } from '@/lib/types';

export interface ICharge extends Document {
  _id: Types.ObjectId;
  buildingId: Types.ObjectId;
  apartmentId: Types.ObjectId;
  type: ChargeType;
  title: string;
  amount: number;
  currency: string;
  period?: string | null; // YYYY-MM for monthly charges
  dueDate: Date;
  status: ChargeStatus;
  invoiceNumber?: string; // Sequential invoice number (assigned on first view)
  invoicedAt?: Date; // When invoice was first issued
  createdBy: Types.ObjectId;
  createdAt: Date;
}

const chargeSchema = new Schema<ICharge>(
  {
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
    apartmentId: { type: Schema.Types.ObjectId, ref: 'Apartment', required: true, index: true },
    type: { 
      type: String, 
      enum: ['monthly_due', 'one_time', 'repair', 'fund'], 
      required: true 
    },
    title: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD' },
    period: { type: String, default: null }, // YYYY-MM format
    dueDate: { type: Date, required: true },
    status: { type: String, enum: ['open', 'voided'], default: 'open' },
    invoiceNumber: { type: String, sparse: true }, // Assigned on first invoice view
    invoicedAt: { type: Date }, // When invoice was first issued
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Immutable - no updates (except invoice fields)
  }
);

// Indexes for queries and idempotency check
chargeSchema.index({ buildingId: 1, apartmentId: 1, status: 1 });
chargeSchema.index({ buildingId: 1, period: 1 });
chargeSchema.index({ buildingId: 1, dueDate: 1 });
// Unique constraint for monthly charges per apartment per period
chargeSchema.index(
  { buildingId: 1, apartmentId: 1, type: 1, period: 1 },
  { 
    unique: true, 
    partialFilterExpression: { 
      type: 'monthly_due',
      period: { $ne: null },
      status: 'open'
    } 
  }
);
// Unique sparse index for invoice numbers within a building
chargeSchema.index(
  { buildingId: 1, invoiceNumber: 1 },
  { 
    unique: true, 
    sparse: true // Only index documents where invoiceNumber exists
  }
);

const Charge: Model<ICharge> = mongoose.models.Charge || mongoose.model<ICharge>('Charge', chargeSchema);

export default Charge;

