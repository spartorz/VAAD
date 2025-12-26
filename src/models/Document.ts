import mongoose, { Schema, Document as MongoDocument, Model, Types } from 'mongoose';
import { DocumentCategory, DocumentVisibility, FileAttachment } from '@/lib/types';

export interface IDocument extends MongoDocument {
  _id: Types.ObjectId;
  buildingId: Types.ObjectId;
  title: string;
  category: DocumentCategory;
  visibility: DocumentVisibility;
  file: FileAttachment;
  createdBy: Types.ObjectId;
  createdAt: Date;
}

const documentSchema = new Schema<IDocument>(
  {
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
    title: { type: String, required: true, trim: true },
    category: { 
      type: String, 
      enum: ['insurance', 'protocol', 'receipt', 'contract', 'other'],
      required: true 
    },
    visibility: { 
      type: String, 
      enum: ['public', 'residents_only', 'board_only'], 
      default: 'board_only' 
    },
    file: {
      url: { type: String, required: true },
      name: { type: String, required: true },
      mimeType: { type: String, required: true },
      size: { type: Number, required: true },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Indexes
documentSchema.index({ buildingId: 1, category: 1 });
documentSchema.index({ buildingId: 1, visibility: 1 });
documentSchema.index({ buildingId: 1, createdAt: -1 });

const DocumentModel: Model<IDocument> = 
  mongoose.models.Document || mongoose.model<IDocument>('Document', documentSchema);

export default DocumentModel;

