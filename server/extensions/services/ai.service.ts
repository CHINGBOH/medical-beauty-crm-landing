import axios from 'axios';

export class AIService {
  private deepseekApiKey: string;
  private qwenApiKey: string;
  private ollamaBaseUrl: string;
  private ollamaModel: string;

  constructor(deepseekApiKey?: string, qwenApiKey?: string) {
    this.deepseekApiKey = deepseekApiKey || process.env.DEEPSEEK_API_KEY || '';
    this.qwenApiKey = qwenApiKey || process.env.QWEN_API_KEY || '';
    this.ollamaBaseUrl = process.env.OLLAMA_BASE_URL || '';
    this.ollamaModel = process.env.OLLAMA_MODEL || 'qwen2.5:latest';
  }

  // 客户对话（DeepSeek）
  async chatWithCustomer(messages: any[], knowledgeBase: any[] = []) {
    const context = this.buildContext(knowledgeBase);
    if (this.ollamaBaseUrl) {
      const response = await axios.post(
        `${this.ollamaBaseUrl.replace(/\/$/, '')}/api/chat`,
        {
          model: this.ollamaModel,
          stream: false,
          messages: [
            {
              role: 'system',
              content: `你是深圳妍美医疗美容门诊部的专业医美顾问。请根据以下知识库内容回答问题：\n\n${context}\n\n回答要求：专业、亲切、有耐心。需要提取客户信息时，请自然引导。`
            },
            ...messages
          ],
        }
      );

      return response.data?.message ?? response.data;
    }

    const response = await axios.post(
      'https://api.deepseek.com/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: `你是深圳妍美医疗美容门诊部的专业医美顾问。请根据以下知识库内容回答问题：\n\n${context}\n\n回答要求：专业、亲切、有耐心。需要提取客户信息时，请自然引导。`
          },
          ...messages
        ],
        temperature: 0.7,
        max_tokens: 1000
      },
      {
        headers: {
          'Authorization': `Bearer ${this.deepseekApiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.choices[0].message;
  }

  // 分析客户心理类型（Qwen）
  async analyzePsychologicalType(conversation: string[]) {
    const prompt = `分析以下医美咨询对话，判断客户的心理类型：
    
    ${conversation.join('\n')}
    
    请返回JSON格式：{
      "psychologicalType": "fear|greed|security|sensitive",
      "confidence": 0.9,
      "reasons": ["原因1", "原因2"],
      "recommendedApproach": "建议话术方向"
    }`;

    if (this.ollamaBaseUrl) {
      const response = await axios.post(
        `${this.ollamaBaseUrl.replace(/\/$/, '')}/api/chat`,
        {
          model: this.ollamaModel,
          stream: false,
          messages: [{ role: 'user', content: prompt }],
        }
      );

      const content = response.data?.message?.content || '{}';
      return JSON.parse(content);
    }

    const response = await axios.post(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      {
        model: 'qwen-max',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      },
      {
        headers: {
          'Authorization': `Bearer ${this.qwenApiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return JSON.parse(response.data.choices[0].message.content);
  }

  // 一键生成小红书内容
  async generateXiaohongshuContent(params: {
    projectType: string;
    contentType: 'experience' | 'comparison' | 'price_reveal' | 'avoid_pitfalls' | 'festival';
    tone: 'enthusiastic' | 'professional' | 'casual';
    keywords?: string[];
  }) {
    const templates = {
      experience: `分享我在妍美做{project}的真实体验，{tone}风格`,
      comparison: `{project}前后对比，效果太明显了！`,
      price_reveal: `揭秘{project}的真实价格，别再被坑了`,
      avoid_pitfalls: `做{project}一定要避开的{number}个坑`,
      festival: `{festival}限定！{project}特惠来袭`
    };

    const prompt = `生成一篇小红书医美内容：
    项目：${params.projectType}
    内容类型：${params.contentType}
    语气风格：${params.tone}
    关键词：${params.keywords?.join(',') || ''}
    
    
    返回格式：{
      "title": "标题",
      "content": "正文内容",
      "hashtags": ["#标签1", "#标签2"],
      "tips": "发布建议"
    }`;

    // 调用DeepSeek或Qwen生成
    const response = await this.chatWithCustomer([{ role: 'user', content: prompt }]);
    const content = response?.content || response?.message?.content || response;
    return JSON.parse(content);
  }

  private buildContext(knowledgeBase: any[]): string {
    return knowledgeBase.map(kb => `### ${kb.title}\n${kb.content}`).join('\n\n');
  }
}
