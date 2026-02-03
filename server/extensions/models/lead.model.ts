import { Schema, model, Document } from 'mongoose';

export interface LeadDocument extends Document {
  name?: string;
  phone: string;
  wechat?: string;
  status?: string;
  psychologicalType?: string;
  customerTier?: string;
}

const LeadSchema = new Schema<LeadDocument>(
  {
    name: String,
    phone: { type: String, required: true },
    wechat: String,
    status: String,
    psychologicalType: String,
    customerTier: String,
  },
  { timestamps: true }
);

export const Lead = model<LeadDocument>('Lead', LeadSchema);
