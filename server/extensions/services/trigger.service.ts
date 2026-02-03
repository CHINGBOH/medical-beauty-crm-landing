import axios from 'axios';

export class TriggerService {
  private triggers: any[] = [];
  private weatherApiKey: string;
  private timers: NodeJS.Timeout[] = [];

  constructor(weatherApiKey?: string) {
    this.weatherApiKey = weatherApiKey || process.env.QWEATHER_API_KEY || '';
  }

  // 初始化触发器
  async initializeTriggers() {
    // 加载数据库中的触发规则
    this.triggers = await this.loadTriggersFromDB();
    
    // 设置定时任务
    this.setupCronJobs();
  }

  // 设置定时任务
  private setupCronJobs() {
    this.timers.push(
      setInterval(() => {
        void this.checkTimeTriggers();
      }, 60 * 1000)
    );

    this.timers.push(
      setInterval(() => {
        void this.checkWeatherTriggers();
      }, 30 * 60 * 1000)
    );
  }

  // 检查时间触发器
  private async checkTimeTriggers() {
    const now = new Date();
    const triggers = this.triggers.filter(t => t.trigger_type === 'time');
    
    for (const trigger of triggers) {
      const condition = trigger.trigger_condition;
      
      // 生日提醒
      if (condition.type === 'birthday') {
        await this.handleBirthdayTrigger(trigger);
      }
      
      // 节假日营销
      if (condition.type === 'holiday') {
        await this.handleHolidayTrigger(trigger, now);
      }
      
      // 术后回访
      if (condition.type === 'followup') {
        await this.handleFollowupTrigger(trigger);
      }
      
      // 复购提醒
      if (condition.type === 'repurchase') {
        await this.handleRepurchaseTrigger(trigger);
      }
    }
  }

  // 检查天气触发器
  private async checkWeatherTriggers() {
    // 获取深圳天气
    const weather = await this.getShenzhenWeather();
    const triggers = this.triggers.filter(t => t.trigger_type === 'weather');
    
    for (const trigger of triggers) {
      const condition = trigger.trigger_condition;
      
      // 降温提醒
      if (condition.type === 'temperature_drop' && weather.tempChange <= -8) {
        await this.executeTrigger(trigger, { weather });
      }
      
      // 高温预警
      if (condition.type === 'high_temperature' && weather.temp >= 35) {
        await this.executeTrigger(trigger, { weather });
      }
      
      // 空气质量
      if (condition.type === 'air_quality' && weather.aqi >= 150) {
        await this.executeTrigger(trigger, { weather });
      }
    }
  }

  // 执行触发器动作
  private async executeTrigger(trigger: any, context: any) {
    const action = trigger.action_config;
    
    switch (trigger.action_type) {
      case 'wechat_push':
        await this.sendWechatMessage(action, context);
        break;
      case 'ai_chat':
        await this.startAIChat(action, context);
        break;
      case 'assign_consultant':
        await this.assignConsultant(action, context);
        break;
    }
    
    // 记录日志
    await this.logTriggerExecution(trigger, context);
  }

  // 获取深圳天气
  private async getShenzhenWeather() {
    try {
      const response = await axios.get(
        `https://devapi.qweather.com/v7/weather/now?location=101280601&key=${this.weatherApiKey}`
      );
      
      const aqiResponse = await axios.get(
        `https://devapi.qweather.com/v7/air/now?location=101280601&key=${this.weatherApiKey}`
      );
      
      return {
        temp: response.data.now.temp,
        text: response.data.now.text,
        humidity: response.data.now.humidity,
        aqi: aqiResponse.data.now.aqi,
        tempChange: 0 // 需要计算温差
      };
    } catch (error) {
      console.error('获取天气失败:', error);
      return null;
    }
  }

  // 从数据库加载触发器
  private async loadTriggersFromDB(): Promise<any[]> {
    // 这里从数据库读取
    // 返回示例数据
    return [
      {
        id: 1,
        rule_name: '生日关怀',
        trigger_type: 'time',
        trigger_condition: { type: 'birthday', days_before: 7 },
        action_type: 'wechat_push',
        action_config: { template: 'birthday_greeting' }
      },
      {
        id: 2,
        rule_name: '降温护肤提醒',
        trigger_type: 'weather',
        trigger_condition: { type: 'temperature_drop', threshold: -8 },
        action_type: 'ai_chat',
        action_config: { project: '补水项目', message: '天气降温，注意皮肤保湿哦！' }
      }
    ];
  }

  // 记录触发器执行日志
  private async logTriggerExecution(trigger: any, context: any) {
    // 保存到数据库
    console.log('触发器执行:', trigger.rule_name, context);
  }

  // 各种触发器的具体处理函数
  private async handleBirthdayTrigger(trigger: any) {
    // 实现生日提醒逻辑
  }

  private async handleHolidayTrigger(trigger: any, date: Date) {
    // 实现节假日营销逻辑
  }

  private async handleFollowupTrigger(trigger: any) {
    // 实现术后回访逻辑
  }

  private async handleRepurchaseTrigger(trigger: any) {
    // 实现复购提醒逻辑
  }

  private async sendWechatMessage(config: any, context: any) {
    // 发送企业微信消息
  }

  private async startAIChat(config: any, context: any) {
    // 启动AI主动对话
  }

  private async assignConsultant(config: any, context: any) {
    // 分配顾问
  }
}
