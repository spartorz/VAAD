import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IAutoBillingSettings extends Document {
  _id: Types.ObjectId;
  buildingId: Types.ObjectId;
  autoBillingEnabled: boolean;
  monthlyAmount?: number;
  currency?: string;
  chargeDayOfMonth: number;
  dueDayOfMonth: number;
  descriptionTemplate: string;
  requireApprovalBeforeGeneration: boolean;
  activeApartmentStatuses: string[];
  lastAutoBillingRunAt?: Date;
  nextAutoBillingRunAt?: Date;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const autoBillingSettingsSchema = new Schema<IAutoBillingSettings>(
  {
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, unique: true, index: true },
    autoBillingEnabled: { type: Boolean, default: false },
    monthlyAmount: { type: Number, min: 0 },
    currency: { type: String },
    chargeDayOfMonth: { type: Number, min: 1, max: 28, default: 1 },
    dueDayOfMonth: { type: Number, min: 1, max: 28, default: 10 },
    descriptionTemplate: { type: String, default: 'דמי ועד בית עבור {period}' },
    requireApprovalBeforeGeneration: { type: Boolean, default: true },
    activeApartmentStatuses: { type: [String], default: ['active'] },
    lastAutoBillingRunAt: { type: Date },
    nextAutoBillingRunAt: { type: Date },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

autoBillingSettingsSchema.index({ buildingId: 1, autoBillingEnabled: 1 });

const AutoBillingSettings: Model<IAutoBillingSettings> =
  mongoose.models.AutoBillingSettings ||
  mongoose.model<IAutoBillingSettings>('AutoBillingSettings', autoBillingSettingsSchema);

export default AutoBillingSettings;
