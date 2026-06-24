import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IPasswordResetToken extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  buildingId: Types.ObjectId;
  /** SHA-256 hex digest of the raw token — the raw token is never stored */
  tokenHash: string;
  expiresAt: Date;
  /** Set when the token is consumed; prevents reuse */
  usedAt?: Date;
  createdAt: Date;
}

const passwordResetTokenSchema = new Schema<IPasswordResetToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Immutable record
  }
);

// MongoDB TTL index — automatically deletes expired, unconsumed tokens after 2 h
// (1 h window + 1 h grace for clock drift / cleanup lag)
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

const PasswordResetToken: Model<IPasswordResetToken> =
  mongoose.models.PasswordResetToken ||
  mongoose.model<IPasswordResetToken>('PasswordResetToken', passwordResetTokenSchema);

export default PasswordResetToken;
