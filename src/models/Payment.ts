import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import { PaymentMethod, PaymentStatus } from '@/lib/types';

export interface IPayment extends Document {
  _id: Types.ObjectId;
  buildingId: Types.ObjectId;
  apartmentId: Types.ObjectId;
  residentId?: Types.ObjectId;
  amount: number;
  currency: string;
  method: PaymentMethod;
  reference?: string;
  paidAt: Date;
  status: PaymentStatus;
  createdBy: Types.ObjectId;
  createdAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
    apartmentId: { type: Schema.Types.ObjectId, ref: 'Apartment', required: true, index: true },
    residentId: { type: Schema.Types.ObjectId, ref: 'Resident' },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD' },
    method: { 
      type: String, 
      enum: ['bank_transfer', 'cash', 'credit_card', 'other'], 
      required: true 
    },
    reference: { type: String, trim: true },
    paidAt: { type: Date, required: true },
    status: { type: String, enum: ['confirmed', 'pending', 'voided'], default: 'confirmed' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Immutable - no updates
  }
);

// Indexes
paymentSchema.index({ buildingId: 1, apartmentId: 1, status: 1 });
paymentSchema.index({ buildingId: 1, paidAt: -1 });
paymentSchema.index({ buildingId: 1, createdAt: -1 });

const Payment: Model<IPayment> = mongoose.models.Payment || mongoose.model<IPayment>('Payment', paymentSchema);

export default Payment;

