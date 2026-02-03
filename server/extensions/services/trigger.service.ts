import cron from 'node-cron';
import axios from 'axios';

export class TriggerService {
  private triggers: any[] = [];
  private weatherApiKey: string;

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
    // 每分钟检查时间触发器
    cron.schedule('* * * * *', () => {
      this.checkTimeTriggers();
    });

    // 每30分钟检查天气
    cron.schedule('*/30 * * * *', () => {
      this.checkWeatherTriggers();
    });
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
docker-compose.yml

yaml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_PASSWORD}
      MYSQL_DATABASE: medbeauty
    volumes:
      - mysql_data:/var/lib/mysql
    ports:
      - "3306:3306"

  backend:
    build: ./backend
    ports:
      - "3001:3001"
    environment:
      DATABASE_URL: mysql://root:${DB_PASSWORD}@mysql:3306/medbeauty
      DEEPSEEK_API_KEY: ${DEEPSEEK_API_KEY}
      QWEN_API_KEY: ${QWEN_API_KEY}
      AIRTABLE_API_KEY: ${AIRTABLE_API_KEY}
      JWT_SECRET: ${JWT_SECRET}
    depends_on:

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      VITE_API_URL: http://localhost:3001
    depends_on:

volumes:
  mysql_data:
backend/Dockerfile

dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3001

CMD ["node", "dist/index.js"]
frontend/Dockerfile

dockerfile
FROM node:18-alpine as builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
.env.example

env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=medbeauty

DEEPSEEK_API_KEY=your_deepseek_key
QWEN_API_KEY=your_qwen_key

AIRTABLE_API_KEY=your_airtable_key
AIRTABLE_BASE_ID=your_base_id
WEATHER_API_KEY=your_weather_key
WECHAT_CORP_ID=your_corp_id
WECHAT_CORP_SECRET=your_corp_secret

JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d

PORT=3001
FRONTEND_URL=http://localhost:3000
NODE_ENV=production
bash
git clone <repository-url>
cd med-beauty-crm

cd backend && npm install
cd ../frontend && npm install

mysql -u root -p < database/init.sql

cp .env.example .env
bash
cd backend
npm run dev

cd frontend
npm run dev

# 前端：http://localhost:3000
# 后端API：http://localhost:3001
# API文档：http://localhost:3001/api-docs
访问管理后台：http://localhost:3000/dashboard

