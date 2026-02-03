import cron from 'node-cron';
import { TriggerRule } from '../models/trigger.model';
import { Lead } from '../models/lead.model';
import { AIService } from './ai.service';
import { WeatherService } from './weather.service';
import { WechatService } from './wechat.service';
import { logger } from '../utils/logger';

export class TriggerEngineService {
  private aiService: AIService;
  private weatherService: WeatherService;
  private wechatService: WechatService;
  private isRunning = false;

  constructor(
    aiService: AIService,
    weatherService: WeatherService,
    wechatService: WechatService
  ) {
    this.aiService = aiService;
    this.weatherService = weatherService;
    this.wechatService = wechatService;
  }

  // 启动触发器引擎
  async start() {
    if (this.isRunning) return;
    this.isRunning = true;

    logger.info('触发器引擎启动...');

    // 每分钟检查时间触发器
    cron.schedule('* * * * *', async () => {
      await this.checkTimeTriggers();
    });

    // 每5分钟检查行为触发器
    cron.schedule('*/5 * * * *', async () => {
      await this.checkBehaviorTriggers();
    });

    // 每30分钟检查天气触发器
    cron.schedule('*/30 * * * *', async () => {
      await this.checkWeatherTriggers();
    });

    logger.info('触发器引擎启动完成');
  }

  // 检查时间触发器
  private async checkTimeTriggers() {
    try {
      const now = new Date();
      const triggers = await TriggerRule.find({
        isActive: true,
        triggerType: 'time',
        $or: [
          { nextTriggerTime: { $lte: now } },
          { nextTriggerTime: { $exists: false } }
        ]
      });

      for (const trigger of triggers) {
        await this.executeTimeTrigger(trigger);
        await this.updateTriggerSchedule(trigger);
      }
    } catch (error) {
      logger.error('检查时间触发器失败:', error);
    }
  }

  // 检查行为触发器
  private async checkBehaviorTriggers() {
    try {
      const triggers = await TriggerRule.find({
        isActive: true,
        triggerType: 'behavior'
      });

      for (const trigger of triggers) {
        const customers = await this.findTargetCustomers(trigger);
        
        for (const customer of customers) {
          const shouldTrigger = await this.evaluateBehaviorCondition(customer, trigger);
          if (shouldTrigger) {
            await this.executeTrigger(trigger, customer);
          }
        }
      }
    } catch (error) {
      logger.error('检查行为触发器失败:', error);
    }
  }

  // 检查天气触发器
  private async checkWeatherTriggers() {
    try {
      const weather = await this.weatherService.getCurrentWeather();
      const triggers = await TriggerRule.find({
        isActive: true,
        triggerType: 'weather'
      });

      for (const trigger of triggers) {
        const shouldTrigger = this.evaluateWeatherCondition(weather, trigger);
        if (shouldTrigger) {
          const customers = await this.findTargetCustomers(trigger);
          for (const customer of customers) {
            await this.executeTrigger(trigger, customer, { weather });
          }
        }
      }
    } catch (error) {
      logger.error('检查天气触发器失败:', error);
    }
  }

  // 执行时间触发器
  private async executeTimeTrigger(trigger: ITriggerRule) {
    const customers = await this.findTargetCustomers(trigger);
    
    for (const customer of customers) {
      await this.executeTrigger(trigger, customer, {
        triggerTime: new Date()
      });
    }
  }

  // 执行触发器
  private async executeTrigger(trigger: ITriggerRule, customer: any, context?: any) {
    try {
      logger.info(`执行触发器: ${trigger.name}, 客户: ${customer.name || customer.phone}`);

      // 更新触发器统计
      await TriggerRule.findByIdAndUpdate(trigger._id, {
        $inc: { 'stats.triggeredCount': 1 },
        lastTriggered: new Date()
      });

      // 执行动作
      let success = false;
      switch (trigger.actionType) {
        case 'wechat_push':
          success = await this.executeWechatPush(trigger, customer, context);
          break;
        case 'ai_chat':
          success = await this.executeAIChat(trigger, customer, context);
          break;
        case 'assign_consultant':
          success = await this.executeAssignConsultant(trigger, customer, context);
          break;
        case 'sms':
          success = await this.executeSMS(trigger, customer, context);
          break;
        case 'email':
          success = await this.executeEmail(trigger, customer, context);
          break;
      }

      // 更新成功统计
      if (success) {
        await TriggerRule.findByIdAndUpdate(trigger._id, {
          $inc: { 'stats.successCount': 1 }
        });
      }

      return success;
    } catch (error) {
      logger.error(`执行触发器失败: ${trigger.name}`, error);
      return false;
    }
  }

  // 执行企业微信推送
  private async executeWechatPush(trigger: ITriggerRule, customer: any, context: any) {
    try {
      const message = this.buildMessage(trigger.actionConfig.message, customer, context);
      await this.wechatService.sendMessageToCustomer(customer.wechat, message);
      return true;
    } catch (error) {
      logger.error('企业微信推送失败:', error);
      return false;
    }
  }

  // 执行AI主动对话
  private async executeAIChat(trigger: ITriggerRule, customer: any, context: any) {
    try {
      const prompt = this.buildAIPrompt(trigger.actionConfig.aiPrompt, customer, context);
      const response = await this.aiService.chatWithCustomer([
        { role: 'system', content: prompt },
        { role: 'user', content: '你好' }
      ]);
      
      // 这里可以将AI回复发送给客户
      await this.wechatService.sendMessageToCustomer(customer.wechat, response.content);
      return true;
    } catch (error) {
      logger.error('AI对话失败:', error);
      return false;
    }
  }

  // 查找目标客户
  private async findTargetCustomers(trigger: ITriggerRule) {
    const query: any = {};
    
    if (trigger.targetCriteria.customerTier?.length) {
      query.customerTier = { $in: trigger.targetCriteria.customerTier };
    }
    
    if (trigger.targetCriteria.psychologicalType?.length) {
      query.psychologicalType = { $in: trigger.targetCriteria.psychologicalType };
    }
    
    if (trigger.targetCriteria.projectInterest?.length) {
      query.interest = { $in: trigger.targetCriteria.projectInterest };
    }
    
    if (trigger.targetCriteria.lastContactDays) {
      const date = new Date();
      date.setDate(date.getDate() - trigger.targetCriteria.lastContactDays);
      query.updatedAt = { $lt: date };
    }
    
    return await Lead.find(query).limit(100); // 限制每次最多100个客户
  }

  // 构建消息
  private buildMessage(template: string, customer: any, context: any): string {
    let message = template || '';
    
    // 替换变量
    message = message.replace(/{name}/g, customer.name || '');
    message = message.replace(/{phone}/g, customer.phone || '');
    message = message.replace(/{project}/g, customer.interest || '');
    message = message.replace(/{date}/g, new Date().toLocaleDateString());
    
    if (context.weather) {
      message = message.replace(/{temperature}/g, context.weather.temp.toString());
      message = message.replace(/{weather}/g, context.weather.text);
    }
    
    return message;
  }

  // 更新触发器调度
  private async updateTriggerSchedule(trigger: ITriggerRule) {
    let nextTime: Date | undefined;
    
    if (trigger.triggerCondition.cronExpression) {
      // 解析cron表达式计算下次触发时间
      // 这里简化处理，实际应该使用cron解析库
      nextTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // 默认明天
    }
    
    await TriggerRule.findByIdAndUpdate(trigger._id, {
      nextTriggerTime: nextTime
    });
  }

  // 评估行为条件
  private async evaluateBehaviorCondition(customer: any, trigger: ITriggerRule): Promise<boolean> {
    const condition = trigger.triggerCondition;
    
    switch (condition.behaviorType) {
      case 'no_contact_90_days':
        const lastContact = customer.updatedAt || customer.createdAt;
        const daysDiff = (Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24);
        return daysDiff >= 90;
        
      case 'high_value_customer':
        return customer.customerTier === 'A' || customer.consumptionLevel === 'high';
        
      case 'consulted_no_appointment':
        // 检查有对话但无预约
        const hasConversation = await this.checkCustomerHasConversation(customer._id);
        const hasAppointment = await this.checkCustomerHasAppointment(customer._id);
        return hasConversation && !hasAppointment;
        
      default:
        return false;
    }
  }

  // 评估天气条件
  private evaluateWeatherCondition(weather: any, trigger: ITriggerRule): boolean {
    const condition = trigger.triggerCondition;
    
    if (!weather) return false;
    
    switch (condition.weatherType) {
      case 'temperature_drop':
        return weather.tempChange <= -8;
        
      case 'high_temperature':
        return weather.temp >= 35;
        
      case 'air_quality':
        return weather.aqi >= 150;
        
      case 'rainy':
        return weather.text.includes('雨');
        
      default:
        return false;
    }
  }

  // 检查客户是否有对话
  private async checkCustomerHasConversation(customerId: string): Promise<boolean> {
    const count = await Conversation.countDocuments({ leadId: customerId });
    return count > 0;
  }

  // 检查客户是否有预约
  private async checkCustomerHasAppointment(customerId: string): Promise<boolean> {
    // 这里需要实现预约检查逻辑
    return false;
  }

  // 构建AI提示词
  private buildAIPrompt(template: string, customer: any, context: any): string {
    let prompt = template || '';
    
    prompt = prompt.replace(/{name}/g, customer.name || '客户');
    prompt = prompt.replace(/{project}/g, customer.interest || '医美项目');
    
    if (context.weather) {
      prompt += `\n当前天气：${context.weather.text}，温度${context.weather.temp}°C`;
    }
    
    return prompt;
  }

  // 分配顾问（简化实现）
  private async executeAssignConsultant(trigger: ITriggerRule, customer: any, context: any): Promise<boolean> {
    // 这里需要实现分配顾问逻辑
    logger.info(`分配顾问给客户 ${customer.name || customer.phone}`);
    return true;
  }

  // 发送短信（简化实现）
  private async executeSMS(trigger: ITriggerRule, customer: any, context: any): Promise<boolean> {
    logger.info(`发送短信给客户 ${customer.phone}`);
    return true;
  }

  // 发送邮件（简化实现）
  private async executeEmail(trigger: ITriggerRule, customer: any, context: any): Promise<boolean> {
    logger.info(`发送邮件给客户 ${customer.email || customer.phone}`);
    return true;
  }
}