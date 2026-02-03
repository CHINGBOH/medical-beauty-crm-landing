import { Chroma } from '@langchain/community/vectorstores/chroma';
import { OpenAIEmbeddings } from '@langchain/openai';
import { MultiQueryRetriever } from 'langchain/retrievers/multi_query';
import { ContextualCompressionRetriever } from 'langchain/retrievers/contextual_compression';
import { LLMChainExtractor } from 'langchain/retrievers/document_compressors/chain_extract';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { ChatOpenAI } from '@langchain/openai';
import { Document } from 'langchain/document';
import { logger } from '../utils/logger';

export class RAGService {
  private vectorStore: Chroma;
  private embeddings: OpenAIEmbeddings;
  private llm: ChatOpenAI;
  private splitter: RecursiveCharacterTextSplitter;
  private knowledgeGraph: Map<string, any> = new Map();

  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'text-embedding-3-small'
    });

    this.llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'gpt-4-turbo-preview',
      temperature: 0.1
    });

    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 100,
    });
  }

  // 初始化知识库
  async initializeKnowledgeBase(knowledgeItems: Array<{
    id: string;
    title: string;
    content: string;
    category: string;
    tags: string[];
    metadata: any;
  }>): Promise<void> {
    // 1. 处理文档
    const documents: Document[] = [];
    
    for (const item of knowledgeItems) {
      const chunks = await this.splitter.createDocuments(
        [item.content],
        [
          {
            source: item.id,
            title: item.title,
            category: item.category,
            tags: JSON.stringify(item.tags),
            ...item.metadata
          }
        ]
      );
      
      documents.push(...chunks);
      
      // 构建知识图谱
      this.buildKnowledgeGraph(item);
    }

    // 2. 创建向量存储
    this.vectorStore = await Chroma.fromDocuments(
      documents,
      this.embeddings,
      {
        collectionName: 'med_beauty_knowledge',
        url: process.env.CHROMA_URL || 'http://localhost:8000'
      }
    );

    logger.info(`知识库初始化完成，共 ${documents.length} 个文档块`);
  }

  // 构建知识图谱
  private buildKnowledgeGraph(item: any): void {
    const entity = {
      id: item.id,
      type: 'knowledge',
      properties: {
        title: item.title,
        category: item.category,
        tags: item.tags,
        createdAt: new Date().toISOString()
      },
      relationships: []
    };

    // 提取实体和关系
    const entities = this.extractEntities(item.content);
    const relationships = this.extractRelationships(item.content, entities);

    entity.relationships = relationships;
    this.knowledgeGraph.set(item.id, entity);

    // 连接相关知识点
    this.linkRelatedConcepts(item);
  }

  // 智能检索
  async intelligentRetrieval(query: string, context?: any): Promise<{
    documents: Document[];
    confidence: number;
    reasoning: string;
  }> {
    // 1. 查询重写（Query Rewriting）
    const rewrittenQueries = await this.rewriteQuery(query, context);
    
    // 2. 多查询检索
    const retriever = new MultiQueryRetriever.fromLLM({
      llm: this.llm,
      retriever: this.vectorStore.asRetriever({
        k: 10,
        filter: this.buildFilters(context)
      }),
      verbose: true
    });

    // 3. 上下文压缩
    const compressor = LLMChainExtractor.fromLLM(this.llm);
    const compressionRetriever = new ContextualCompressionRetriever({
      baseCompressor: compressor,
      baseRetriever: retriever
    });

    // 4. 执行检索
    const documents = await compressionRetriever.getRelevantDocuments(
      rewrittenQueries.join(' ')
    );

    // 5. 重排序（Re-ranking）
    const rerankedDocs = await this.rerankDocuments(documents, query, context);
    
    // 6. 检索评估
    const evaluation = await this.evaluateRetrieval(query, rerankedDocs);

    return {
      documents: rerankedDocs.slice(0, 5), // 返回Top 5
      confidence: evaluation.confidence,
      reasoning: evaluation.reasoning
    };
  }

  // 查询重写
  private async rewriteQuery(originalQuery: string, context?: any): Promise<string[]> {
    const prompt = `
      原始查询：${originalQuery}
      
      ${context ? `上下文信息：${JSON.stringify(context, null, 2)}` : ''}
      
      
      返回JSON格式：["query1", "query2", "query3"]
    `;

    const response = await this.llm.invoke(prompt);
    const queries = JSON.parse(response.content as string);
    
    // 添加原始查询
    return [originalQuery, ...queries];
  }

  // 构建检索过滤器
  private buildFilters(context?: any): any {
    const filters: any = {};
    
    if (context?.customerType) {
      // 根据客户类型过滤
      if (context.customerType === 'fear') {
        filters.tags = { $contains: '安全' };
      } else if (context.customerType === 'greed') {
        filters.tags = { $contains: '性价比' };
      }
    }
    
    if (context?.projectInterest) {
      filters.category = context.projectInterest;
    }
    
    return filters;
  }

  // 文档重排序
  private async rerankDocuments(documents: Document[], query: string, context?: any): Promise<Document[]> {
    // 使用LLM进行相关性评分
    const scoringPromises = documents.map(async (doc, index) => {
      const score = await this.scoreRelevance(doc, query, context);
      return { index, score, document: doc };
    });

    const scoredDocs = await Promise.all(scoringPromises);
    
    // 按分数降序排序
    return scoredDocs
      .sort((a, b) => b.score - a.score)
      .map(item => item.document);
  }

  // 相关性评分
  private async scoreRelevance(document: Document, query: string, context?: any): Promise<number> {
    const prompt = `
      
      查询：${query}
      
      ${context ? `上下文：${JSON.stringify(context, null, 2)}` : ''}
      
      文档内容：${document.pageContent.substring(0, 500)}
      
      文档元数据：${JSON.stringify(document.metadata, null, 2)}
      
      
      返回格式：{"score": 85, "reason": "..."}
    `;

    try {
      const response = await this.llm.invoke(prompt);
      const result = JSON.parse(response.content as string);
      return result.score;
    } catch (error) {
      logger.error('相关性评分失败:', error);
      return 50; // 默认分数
    }
  }

  // 检索评估
  private async evaluateRetrieval(query: string, documents: Document[]): Promise<{
    confidence: number;
    reasoning: string;
  }> {
    if (documents.length === 0) {
      return { confidence: 0, reasoning: '没有找到相关信息' };
    }

    const prompt = `
      
      查询：${query}
      
      ${documents.map((doc, i) => `[${i + 1}] ${doc.pageContent.substring(0, 200)}...`).join('\n')}
      
      
      格式：{"confidence": 85, "reasoning": "..."}
    `;

    const response = await this.llm.invoke(prompt);
    return JSON.parse(response.content as string);
  }

  // 提取实体
  private extractEntities(text: string): string[] {
    // 简化版实体提取，实际应该用NLP库
    const entityPatterns = [
    ];

    const entities: Set<string> = new Set();
    
    for (const pattern of entityPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => entities.add(match.toLowerCase()));
      }
    }

    return Array.from(entities);
  }

  // 提取关系
  private extractRelationships(text: string, entities: string[]): any[] {
    // 简化版关系提取
    const relationships = [];
    
    // 检查项目-效果关系
    if (text.includes('效果') || text.includes('恢复')) {
      const projectEntities = entities.filter(e => 
        ['超皮秒', '水光针', '热玛吉'].includes(e)
      );
      
      for (const project of projectEntities) {
        relationships.push({
          source: project,
          type: 'has_effect',
          target: 'improvement',
          strength: 0.8
        });
      }
    }

    return relationships;
  }

  // 链接相关概念
  private linkRelatedConcepts(item: any): void {
    // 实现概念链接逻辑
    // 这里可以链接相关的知识条目
  }

  // 增量更新知识库
  async updateKnowledgeIncrementally(newKnowledge: any): Promise<void> {
    // 1. 处理新知识
    const documents = await this.splitter.createDocuments(
      [newKnowledge.content],
      [{
        source: newKnowledge.id,
        title: newKnowledge.title,
        category: newKnowledge.category,
        tags: JSON.stringify(newKnowledge.tags),
        ...newKnowledge.metadata
      }]
    );

    // 2. 添加到向量存储
    await this.vectorStore.addDocuments(documents);

    // 3. 更新知识图谱
    this.buildKnowledgeGraph(newKnowledge);

    logger.info(`知识库增量更新完成：${newKnowledge.title}`);
  }
}