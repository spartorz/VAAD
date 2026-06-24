import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface ITicketSlaPolicy extends Document {
  _id: Types.ObjectId;
  buildingId: Types.ObjectId;
  responseTargetsMinutes: {
    low: number;
    medium: number;
    high: number;
    urgent: number;
  };
  resolutionTargetsMinutes: {
    low: number;
    medium: number;
    high: number;
    urgent: number;
  };
  gracePeriodMinutes: number;
  businessHoursOnly: boolean;
  version: number;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ticketSlaPolicySchema = new Schema<ITicketSlaPolicy>(
  {
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, unique: true, index: true },
    responseTargetsMinutes: {
      low: { type: Number, default: 24 * 60, min: 1 },
      medium: { type: Number, default: 8 * 60, min: 1 },
      high: { type: Number, default: 4 * 60, min: 1 },
      urgent: { type: Number, default: 60, min: 1 },
    },
    resolutionTargetsMinutes: {
      low: { type: Number, default: 7 * 24 * 60, min: 1 },
      medium: { type: Number, default: 3 * 24 * 60, min: 1 },
      high: { type: Number, default: 24 * 60, min: 1 },
      urgent: { type: Number, default: 6 * 60, min: 1 },
    },
    gracePeriodMinutes: { type: Number, default: 0, min: 0 },
    businessHoursOnly: { type: Boolean, default: false },
    version: { type: Number, default: 1, min: 1 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const TicketSlaPolicy: Model<ITicketSlaPolicy> =
  mongoose.models.TicketSlaPolicy ||
  mongoose.model<ITicketSlaPolicy>('TicketSlaPolicy', ticketSlaPolicySchema);

export default TicketSlaPolicy;
