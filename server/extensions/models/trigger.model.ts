import { Schema, model, Document } from 'mongoose';

interface ITriggerRule extends Document {
  name: string;
  description?: string;
  triggerType: 'time' | 'behavior' | 'weather' | 'event';
  triggerCondition: {
    type: string;
    // 时间触发
    cronExpression?: string;
    daysBefore?: number;
    // 行为触发
    behaviorType?: string;
    threshold?: number;
    // 天气触发
    weatherType?: string;
    comparison?: 'gt' | 'lt' | 'eq';
    value?: number;
    // 事件触发
    eventType?: string;
  };
  actionType: 'wechat_push' | 'ai_chat' | 'assign_consultant' | 'sms' | 'email';
  actionConfig: {
    // 消息推送
    templateId?: string;
    message?: string;
    // AI对话
    aiPrompt?: string;
    // 分配顾问
    consultantId?: string;
    // 通用
    delayMinutes?: number;
    retryTimes?: number;
  };
  targetCriteria: {
    customerTier?: string[];
    psychologicalType?: string[];
    projectInterest?: string[];
    lastContactDays?: number;
  };
  isActive: boolean;
  lastTriggered?: Date;
  nextTriggerTime?: Date;
  stats: {
    triggeredCount: number;
    successCount: number;
    conversionCount: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const triggerRuleSchema = new Schema<ITriggerRule>({
  name: { type: String, required: true },
  description: { type: String },
  triggerType: { 
    type: String, 
    required: true,
    enum: ['time', 'behavior', 'weather', 'event']
  },
  triggerCondition: {
    type: { type: String, required: true },
    cronExpression: { type: String },
    daysBefore: { type: Number },
    behaviorType: { type: String },
    threshold: { type: Number },
    weatherType: { type: String },
    comparison: { type: String },
    value: { type: Number },
    eventType: { type: String }
  },
  actionType: { 
    type: String, 
    required: true,
    enum: ['wechat_push', 'ai_chat', 'assign_consultant', 'sms', 'email']
  },
  actionConfig: {
    templateId: { type: String },
    message: { type: String },
    aiPrompt: { type: String },
    consultantId: { type: String },
    delayMinutes: { type: Number, default: 0 },
    retryTimes: { type: Number, default: 3 }
  },
  targetCriteria: {
    customerTier: [{ type: String }],
    psychologicalType: [{ type: String }],
    projectInterest: [{ type: String }],
    lastContactDays: { type: Number }
  },
  isActive: { type: Boolean, default: true },
  lastTriggered: { type: Date },
  nextTriggerTime: { type: Date },
  stats: {
    triggeredCount: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    conversionCount: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

// 索引
triggerRuleSchema.index({ isActive: 1, nextTriggerTime: 1 });
triggerRuleSchema.index({ triggerType: 1 });

export const TriggerRule = model<ITriggerRule>('TriggerRule', triggerRuleSchema);