import { OpenAIEmbeddings } from '@langchain/openai';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { Document } from 'langchain/document';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { logger } from '../utils/logger';

interface SemanticContext {
  customerProfile?: CustomerProfile;
  conversationHistory?: Conversation[];
  businessContext?: BusinessContext;
  temporalContext?: TemporalContext;
}

interface CustomerProfile {
  demographic: any;
  behavioral: any;
  psychographic: any;
  transactional: any;
}

export class SemanticUnderstandingService {
  private embeddings: OpenAIEmbeddings;
  private vectorStore: MemoryVectorStore;
  private splitter: RecursiveCharacterTextSplitter;

  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'text-embedding-3-small'
    });

    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
  }

  // 增强AI对客户的理解
  async enhanceCustomerUnderstanding(customerData: any, conversationHistory: any[]): Promise<SemanticContext> {
    const context: SemanticContext = {};

    // 1. 构建客户画像
    context.customerProfile = await this.buildCustomerProfile(customerData);

    // 2. 分析对话历史
    context.conversationHistory = await this.analyzeConversationHistory(conversationHistory);

    // 3. 添加上下文信息
    context.businessContext = await this.getBusinessContext();
    context.temporalContext = await this.getTemporalContext();

    return context;
  }

  // 构建客户画像
  private async buildCustomerProfile(data: any): Promise<CustomerProfile> {
    const profile: CustomerProfile = {
      demographic: {},
      behavioral: {},
      psychographic: {},
      transactional: {}
    };

    // 人口统计信息
    if (data.age || data.gender || data.location) {
      profile.demographic = {
        age: data.age,
        gender: data.gender,
        location: data.location,
        occupation: data.occupation
      };
    }

    // 行为数据
    profile.behavioral = {
      inquiryPattern: await this.analyzeInquiryPattern(data.conversations || []),
      responseTime: await this.calculateAverageResponseTime(data.conversations || []),
      engagementLevel: await this.calculateEngagementLevel(data),
      preferredChannel: data.source || 'unknown'
    };

    // 心理特征
    if (data.psychologicalType) {
      profile.psychographic = {
        primaryType: data.psychologicalType,
        secondaryTraits: await this.inferSecondaryTraits(data),
        decisionStyle: await this.analyzeDecisionStyle(data),
        painPoints: await this.identifyPainPoints(data)
      };
    }

    // 交易历史
    if (data.transactions && data.transactions.length > 0) {
      profile.transactional = {
        lifetimeValue: this.calculateLTV(data.transactions),
        purchaseFrequency: data.transactions.length,
        lastPurchase: data.transactions[data.transactions.length - 1].date,
        preferredProducts: await this.analyzeProductPreferences(data.transactions)
      };
    }

    return profile;
  }

  // 分析咨询模式
  private async analyzeInquiryPattern(conversations: any[]): Promise<any> {
    if (conversations.length === 0) return {};

    // 使用LLM分析咨询模式
    const inquiryText = conversations
      .map(c => c.messages.map((m: any) => m.content).join(' '))
      .join(' ');

    const analysis = await this.analyzeWithLLM(
      `分析以下医美咨询对话的客户咨询模式：${inquiryText.substring(0, 2000)}`,
      {
        patterns: ['价格敏感', '效果导向', '安全关注', '时间紧迫', '犹豫不决'],
        urgencyLevel: 'low|medium|high',
        decisionFactors: ['价格', '效果', '医生资质', '恢复时间', '案例']
      }
    );

    return analysis;
  }

  // 使用LLM分析
  private async analyzeWithLLM(text: string, schema: any): Promise<any> {
    // 这里调用DeepSeek或OpenAI进行分析
    const prompt = `
      文本：${text}
      
      ${JSON.stringify(schema, null, 2)}
      
    `;

    // 调用AI API
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' }
      })
    });

    const result = await response.json();
    return JSON.parse(result.choices[0].message.content);
  }

  // 构建上下文向量存储
  async buildContextVectorStore(documents: Document[]): Promise<void> {
    const chunks = await this.splitter.splitDocuments(documents);
    this.vectorStore = await MemoryVectorStore.fromDocuments(
      chunks,
      this.embeddings
    );
  }

  // 语义搜索
  async semanticSearch(query: string, k = 5): Promise<Document[]> {
    if (!this.vectorStore) {
      throw new Error('向量存储未初始化');
    }

    return await this.vectorStore.similaritySearch(query, k);
  }

  // 动态生成AI提示词
  async generateDynamicPrompt(customerData: any, query: string): Promise<string> {
    const context = await this.enhanceCustomerUnderstanding(customerData, []);
    const similarCases = await this.semanticSearch(query);

    const prompt = `
      
      ${JSON.stringify(context.customerProfile, null, 2)}
      
      ${similarCases.map(doc => doc.pageContent).join('\n---\n')}
      
      当前咨询：${query}
      
      注意客户的心理类型是：${context.customerProfile?.psychographic?.primaryType || '未知'}
      
    `;

    return prompt;
  }
}


