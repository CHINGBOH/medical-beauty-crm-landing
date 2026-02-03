import { Schema, model, Document } from 'mongoose';

interface IContentTemplate extends Document {
  name: string;
  projectType: string;
  contentType: 'experience' | 'comparison' | 'price_reveal' | 'avoid_pitfalls' | 'festival';
  tone: 'enthusiastic' | 'professional' | 'casual';
  template: {
    title: string;
    structure: string[];
    hashtags: string[];
    tips: string;
  };
  example?: string;
  usageCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const contentTemplateSchema = new Schema<IContentTemplate>({
  name: { type: String, required: true },
  projectType: { type: String, required: true },
  contentType: { 
    type: String, 
    required: true,
    enum: ['experience', 'comparison', 'price_reveal', 'avoid_pitfalls', 'festival']
  },
  tone: { 
    type: String, 
    required: true,
    enum: ['enthusiastic', 'professional', 'casual']
  },
  template: {
    title: { type: String, required: true },
    structure: [{ type: String, required: true }],
    hashtags: [{ type: String, required: true }],
    tips: { type: String, required: true }
  },
  example: { type: String },
  usageCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

// 索引
contentTemplateSchema.index({ projectType: 1, contentType: 1, tone: 1 });
contentTemplateSchema.index({ usageCount: -1 });

export const ContentTemplate = model<IContentTemplate>('ContentTemplate', contentTemplateSchema);