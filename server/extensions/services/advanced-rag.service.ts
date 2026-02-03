import { Chroma } from '@langchain/community/vectorstores/chroma';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PineconeStore } from '@langchain/pinecone';
import { Pinecone } from '@pinecone-database/pinecone';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { Document } from 'langchain/document';
import { ChatOpenAI } from '@langchain/openai';
import { Neo4jGraph } from '@langchain/community/graphs/neo4j_graph';
import { LLMChain } from 'langchain/chains';
import { PromptTemplate } from '@langchain/core/prompts';
import { Redis } from 'ioredis';
import { logger } from '../utils/logger';

// 检索结果增强
interface EnhancedDocument extends Document {
  relevanceScore: number;
  confidence: number;
  metadata: {
    source: string;
    category: string;
    tags: string[];
    entities: string[];
    relatedConcepts: string[];
    freshness: number; // 0-1, 1表示最新
    authority: number; // 0-1, 权威性分数
  };
  reasoning: string; // 为什么这个文档相关
  contextSnippets?: string[]; // 关键片段
}

// 多阶段检索配置
interface RetrievalStage {
  name: string;
  weight: number;
  enabled: boolean;
  config: any;
}

export class AdvancedRAGService {
  // 向量存储
  private vectorStores: Map<string, Chroma | PineconeStore> = new Map();
  private pinecone: Pinecone;
  
  // 知识图谱
  private knowledgeGraph: Neo4jGraph | null = null;
  
  // LLM
  private llm: ChatOpenAI;
  private rerankLlm: ChatOpenAI;
  
  // 缓存
  private redis: Redis;
  private embeddingCache: Map<string, number[]> = new Map();
  
  // 检索策略
  private retrievalStages: RetrievalStage[] = [
    {
      name: 'semantic_search',
      weight: 0.4,
      enabled: true,
      config: {
        k: 20,
        filter: {},
        scoreThreshold: 0.7
      }
    },
    {
      name: 'keyword_search',
      weight: 0.2,
      enabled: true,
      config: {
        boostCategories: ['faq', 'procedure', 'pricing'],
        excludeCategories: ['internal', 'template']
      }
    },
    {
      name: 'knowledge_graph',
      weight: 0.3,
      enabled: true,
      config: {
        maxDepth: 2,
        limit: 10
      }
    },
    {
      name: 'temporal_search',
      weight: 0.1,
      enabled: true,
      config: {
        recentDays: 90,
        boostNew: true
      }
    }
  ];

  constructor() {
    // 初始化LLM
    this.llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'gpt-4-turbo-preview',
      temperature: 0.1,
      maxTokens: 4000
    });

    this.rerankLlm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'gpt-3.5-turbo',
      temperature: 0,
      maxTokens: 1000
    });

    // 初始化Pinecone
    this.pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!
    });

    // 初始化Redis
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379')
    });

    // 初始化知识图谱
    this.initializeKnowledgeGraph();
  }

  /**
   */
  private async initializeKnowledgeGraph(): Promise<void> {
    try {
      this.knowledgeGraph = await Neo4jGraph.initialize({
        url: process.env.NEO4J_URL || 'bolt://localhost:7687',
        username: process.env.NEO4J_USERNAME || 'neo4j',
        password: process.env.NEO4J_PASSWORD || 'password',
        database: process.env.NEO4J_DATABASE || 'neo4j'
      });
      
      logger.info('知识图谱连接成功');
    } catch (error) {
      logger.warn('知识图谱连接失败，降级为纯向量检索:', error);
      this.knowledgeGraph = null;
    }
  }

  /**
   */
  async intelligentRetrieval(
    query: string,
    context: {
      conversationHistory?: any[];
      customerProfile?: any;
      currentIntent?: string;
      filters?: Record<string, any>;
    } = {}
  ): Promise<{
    documents: EnhancedDocument[];
    retrievalPath: string[];
    confidence: number;
    reasoning: string;
    suggestedQuestions: string[];
  }> {
    const retrievalId = `retrieval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const retrievalPath: string[] = [];
    
    logger.info(`开始智能检索: ${query.substring(0, 100)}...`, {
      retrievalId,
      context: context.currentIntent
    });

    try {
      // 阶段1: 查询理解和重写
      const { rewrittenQuery, intent, entities } = await this.analyzeAndRewriteQuery(query, context);
      retrievalPath.push(`query_analysis:${intent}`);
      
      // 阶段2: 多阶段并行检索
      const stageResults = await this.executeRetrievalStages(rewrittenQuery, context, entities);
      retrievalPath.push(...stageResults.paths);

      // 阶段3: 结果融合和重排序
      const mergedResults = await this.mergeAndRerankResults(
        stageResults.results,
        query,
        rewrittenQuery,
        context
      );

      // 阶段4: 结果增强和验证
      const enhancedResults = await this.enhanceAndValidateResults(
        mergedResults,
        query,
        context
      );

      // 阶段5: 生成相关建议问题
      const suggestedQuestions = await this.generateSuggestedQuestions(
        enhancedResults,
        query,
        context
      );

      // 评估检索质量
      const evaluation = await this.evaluateRetrievalQuality(
        enhancedResults,
        query,
        context
      );

      logger.info(`智能检索完成: ${retrievalId}`, {
        queryLength: query.length,
        resultsCount: enhancedResults.length,
        confidence: evaluation.confidence,
        stagesUsed: retrievalPath.length
      });

      return {
        documents: enhancedResults,
        retrievalPath,
        confidence: evaluation.confidence,
        reasoning: evaluation.reasoning,
        suggestedQuestions
      };
    } catch (error) {
      logger.error('智能检索失败:', error);
      
      // 降级方案: 基础向量检索
      const fallbackResults = await this.fallbackRetrieval(query);
      retrievalPath.push('fallback:vector_search');
      
      return {
        documents: fallbackResults,
        retrievalPath,
        confidence: 0.3,
        reasoning: '检索失败，使用基础向量检索作为降级方案',
        suggestedQuestions: []
      };
    }
  }

  /**
   */
  private async analyzeAndRewriteQuery(
    originalQuery: string,
    context: any
  ): Promise<{
    rewrittenQuery: string;
    intent: string;
    entities: string[];
    categories: string[];
  }> {
    const cacheKey = `query_analysis:${Buffer.from(originalQuery).toString('base64')}`;
    
    // 检查缓存
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const prompt = PromptTemplate.fromTemplate(`
      
      原始查询：{query}
      
      {conversationHistory}
      
      {customerProfile}
      
      
      {{
        "intent": "识别的意图",
        "entities": ["实体1", "实体2"],
        "categories": ["类别1", "类别2"],
        "rewrittenQueries": ["重写版本1", "重写版本2"],
        "reasoning": "分析理由"
      }}
    `);

    const chain = new LLMChain({
      llm: this.llm,
      prompt,
      outputKey: 'analysis'
    });

    const result = await chain.call({
      query: originalQuery,
      conversationHistory: context.conversationHistory 
        ? JSON.stringify(context.conversationHistory.slice(-3))
        : '[]',
      customerProfile: context.customerProfile 
        ? JSON.stringify(context.customerProfile)
        : '{}'
    });

    const analysis = JSON.parse(result.analysis);
    
    // 缓存结果（5分钟）
    await this.redis.setex(cacheKey, 300, JSON.stringify({
      rewrittenQuery: analysis.rewrittenQueries[0],
      intent: analysis.intent,
      entities: analysis.entities,
      categories: analysis.categories
    }));

    return {
      rewrittenQuery: analysis.rewrittenQueries[0],
      intent: analysis.intent,
      entities: analysis.entities,
      categories: analysis.categories
    };
  }

  /**
   */
  private async executeRetrievalStages(
    query: string,
    context: any,
    entities: string[]
  ): Promise<{
    results: Map<string, Document[]>;
    paths: string[];
  }> {
    const stagePromises: Array<Promise<{ name: string; results: Document[] }>> = [];
    const paths: string[] = [];

    for (const stage of this.retrievalStages) {
      if (!stage.enabled) continue;

      stagePromises.push(
        this.executeRetrievalStage(stage, query, context, entities)
          .then(results => {
            paths.push(`${stage.name}:${results.length}docs`);
            return { name: stage.name, results };
          })
          .catch(error => {
            logger.warn(`检索阶段 ${stage.name} 失败:`, error);
            paths.push(`${stage.name}:failed`);
            return { name: stage.name, results: [] };
          })
      );
    }

    // 并行执行所有检索阶段
    const stageResults = await Promise.all(stagePromises);
    
    // 合并结果
    const resultsMap = new Map<string, Document[]>();
    for (const stageResult of stageResults) {
      if (stageResult.results.length > 0) {
        resultsMap.set(stageResult.name, stageResult.results);
      }
    }

    return { results: resultsMap, paths };
  }

  /**
   */
  private async executeRetrievalStage(
    stage: RetrievalStage,
    query: string,
    context: any,
    entities: string[]
  ): Promise<Document[]> {
    switch (stage.name) {
      case 'semantic_search':
        return await this.semanticSearch(query, stage.config, context.filters);
        
      case 'keyword_search':
        return await this.keywordSearch(query, entities, stage.config);
        
      case 'knowledge_graph':
        return await this.knowledgeGraphSearch(query, entities, stage.config);
        
      case 'temporal_search':
        return await this.temporalSearch(query, stage.config);
        
      default:
        return [];
    }
  }

  /**
   */
  private async semanticSearch(
    query: string,
    config: any,
    filters?: Record<string, any>
  ): Promise<Document[]> {
    try {
      // 获取查询向量
      const queryVector = await this.getQueryEmbedding(query);
      
      // 从多个向量存储中检索
      const results: Document[] = [];
      
      for (const [storeName, vectorStore] of this.vectorStores) {
        const storeResults = await vectorStore.similaritySearchVectorWithScore(
          queryVector,
          config.k,
          this.buildFilters(storeName, filters)
        );
        
        // 转换并过滤分数
        const filteredResults = storeResults
          .filter(([_, score]) => score >= config.scoreThreshold)
          .map(([doc, score]) => {
            const enhancedDoc = doc as EnhancedDocument;
            enhancedDoc.relevanceScore = score;
            return enhancedDoc;
          });
        
        results.push(...filteredResults);
      }
      
      return results;
    } catch (error) {
      logger.error('语义搜索失败:', error);
      return [];
    }
  }

  /**
   */
  private async keywordSearch(
    query: string,
    entities: string[],
    config: any
  ): Promise<Document[]> {
    // 构建关键词查询
    const keywords = this.extractKeywords(query);
    const allKeywords = [...keywords, ...entities];
    
    if (allKeywords.length === 0) {
      return [];
    }

    // 从数据库执行关键词搜索
    const keywordQuery = allKeywords
      .map(keyword => `(title LIKE '%${keyword}%' OR content LIKE '%${keyword}%')`)
      .join(' OR ');

    // 这里需要实现具体的数据库查询
    // 简化示例：
    const documents: Document[] = [];
    
    // 实现具体的数据库查询逻辑
    // const dbResults = await database.query(`
    //   SELECT * FROM knowledge_base 
    //   WHERE ${keywordQuery}
    //   AND category IN (${config.boostCategories.map(c => `'${c}'`).join(',')})
    //   LIMIT 20
    // `);
    
    // for (const row of dbResults) {
    //   documents.push(new Document({
    //     pageContent: row.content,
    //     metadata: {
    //       source: row.id,
    //       title: row.title,
    //       category: row.category,
    //       tags: JSON.parse(row.tags || '[]'),
    //       entities: this.extractEntities(row.content)
    //     }
    //   }));
    // }
    
    return documents;
  }

  /**
   */
  private async knowledgeGraphSearch(
    query: string,
    entities: string[],
    config: any
  ): Promise<Document[]> {
    if (!this.knowledgeGraph || entities.length === 0) {
      return [];
    }

    try {
      const documents: Document[] = [];
      
      for (const entity of entities.slice(0, 5)) { // 限制前5个实体
        // 查询知识图谱
        const cypherQuery = `
          MATCH (e:Entity {name: $entity})-[r*1..${config.maxDepth}]-(related)
          WHERE related:Knowledge OR related:Document
          RETURN related, type(r) as relationship, e.name as sourceEntity
          LIMIT ${config.limit}
        `;
        
        // 执行Cypher查询
        // const results = await this.knowledgeGraph.query(cypherQuery, { entity });
        
        // 转换结果
        // for (const record of results) {
        //   const node = record.get('related');
        //   const doc = new Document({
        //     pageContent: node.properties.content || node.properties.name,
        //     metadata: {
        //       source: `kg:${node.identity}`,
        //       entity: record.get('sourceEntity'),
        //       relationship: record.get('relationship'),
        //       type: node.labels.join(',')
        //     }
        //   });
          
        //   (doc as EnhancedDocument).relevanceScore = 0.8; // 知识图谱结果默认分数
        //   documents.push(doc);
        // }
      }
      
      return documents;
    } catch (error) {
      logger.error('知识图谱搜索失败:', error);
      return [];
    }
  }

  /**
   */
  private async temporalSearch(
    query: string,
    config: any
  ): Promise<Document[]> {
    // 优先搜索近期更新的内容
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - config.recentDays);
    
    // 这里需要实现时间敏感的数据库查询
    const documents: Document[] = [];
    
    // 实现具体的时间敏感查询逻辑
    // const dbResults = await database.query(`
    //   SELECT * FROM knowledge_base 
    //   WHERE updated_at >= $1
    //   ORDER BY updated_at DESC
    //   LIMIT 10
    // `, [cutoffDate]);
    
    // for (const row of dbResults) {
    //   const doc = new Document({
    //     pageContent: row.content,
    //     metadata: {
    //       source: row.id,
    //       title: row.title,
    //       updatedAt: row.updated_at,
    //       freshness: this.calculateFreshnessScore(row.updated_at)
    //     }
    //   });
      
    //   if (config.boostNew) {
    //     (doc as EnhancedDocument).relevanceScore = 0.9; // 新内容高分数
    //   }
      
    //   documents.push(doc);
    // }
    
    return documents;
  }

  /**
   */
  private async mergeAndRerankResults(
    stageResults: Map<string, Document[]>,
    originalQuery: string,
    rewrittenQuery: string,
    context: any
  ): Promise<EnhancedDocument[]> {
    // 收集所有结果
    const allDocuments: EnhancedDocument[] = [];
    const seenIds = new Set<string>();
    
    for (const [stageName, documents] of stageResults) {
      const stageWeight = this.retrievalStages.find(s => s.name === stageName)?.weight || 0;
      
      for (const doc of documents) {
        const enhancedDoc = doc as EnhancedDocument;
        
        // 去重
        const docId = this.generateDocumentId(enhancedDoc);
        if (seenIds.has(docId)) {
          continue;
        }
        seenIds.add(docId);
        
        // 调整分数（考虑阶段权重）
        enhancedDoc.relevanceScore = (enhancedDoc.relevanceScore || 0.5) * stageWeight;
        
        allDocuments.push(enhancedDoc);
      }
    }
    
    if (allDocuments.length === 0) {
      return [];
    }
    
    // 使用LLM进行智能重排序
    const rerankedDocs = await this.rerankWithLLM(
      allDocuments,
      originalQuery,
      rewrittenQuery,
      context
    );
    
    return rerankedDocs;
  }

  /**
   */
  private async rerankWithLLM(
    documents: EnhancedDocument[],
    originalQuery: string,
    rewrittenQuery: string,
    context: any
  ): Promise<EnhancedDocument[]> {
    if (documents.length <= 1) {
      return documents;
    }
    
    try {
      // 为LLM准备文档摘要
      const documentSummaries = documents.map((doc, index) => {
        const summary = doc.pageContent.substring(0, 200);
        const metadata = doc.metadata;
        
        return `[${index}] ${metadata.title || '无标题'}
内容摘要: ${summary}...
相关度分: ${doc.relevanceScore.toFixed(2)}
类别: ${metadata.category || '未分类'}
标签: ${(metadata.tags || []).slice(0, 3).join(', ')}`;
      }).join('\n\n');
      
      const prompt = `
        
        原始查询：${originalQuery}
        优化查询：${rewrittenQuery}
        
        - 意图: ${context.currentIntent || '未识别'}
        - 客户类型: ${context.customerProfile?.psychologicalType || '未知'}
        
        ${documentSummaries}
        
        
        
        {
          "sortedIndices": [2, 0, 1, ...],
          "reasoning": "排序理由，每篇文档的得分说明"
        }
      `;
      
      const response = await this.rerankLlm.invoke(prompt);
      const result = JSON.parse(response.content as string);
      
      // 重新排序文档
      const sortedDocuments = result.sortedIndices
        .map((index: number) => documents[index])
        .filter(Boolean);
      
      // 更新文档的reasoning字段
      sortedDocuments.forEach((doc, index) => {
        doc.reasoning = `重排序第${index + 1}位: ${result.reasoning}`;
      });
      
      return sortedDocuments;
    } catch (error) {
      logger.error('LLM重排序失败:', error);
      // 降级：按原始分数排序
      return documents.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    }
  }

  /**
   */
  private async enhanceAndValidateResults(
    documents: EnhancedDocument[],
    query: string,
    context: any
  ): Promise<EnhancedDocument[]> {
    if (documents.length === 0) {
      return documents;
    }
    
    const enhancedDocs: EnhancedDocument[] = [];
    
    for (const doc of documents.slice(0, 10)) { // 只增强前10个结果
      try {
        const enhanced = await this.enhanceSingleDocument(doc, query, context);
        
        // 验证文档质量
        const isValid = await this.validateDocument(enhanced, query);
        if (isValid) {
          enhancedDocs.push(enhanced);
        }
      } catch (error) {
        logger.warn('文档增强失败:', error);
        // 保留原始文档
        enhancedDocs.push(doc);
      }
    }
    
    return enhancedDocs;
  }

  /**
   */
  private async enhanceSingleDocument(
    document: EnhancedDocument,
    query: string,
    context: any
  ): Promise<EnhancedDocument> {
    // 提取关键片段
    const keySnippets = await this.extractKeySnippets(document.pageContent, query);
    
    // 识别文档中的相关实体
    const entities = this.extractEntities(document.pageContent);
    
    // 计算权威性分数
    const authorityScore = this.calculateAuthorityScore(document.metadata);
    
    // 计算时效性分数
    const freshnessScore = this.calculateFreshnessScore(document.metadata.updatedAt);
    
    // 识别相关概念
    const relatedConcepts = await this.extractRelatedConcepts(document.pageContent);
    
    // 构建增强的元数据
    const enhancedMetadata = {
      ...document.metadata,
      entities,
      authority: authorityScore,
      freshness: freshnessScore,
      relatedConcepts,
      enhancedAt: new Date().toISOString()
    };
    
    return {
      ...document,
      metadata: enhancedMetadata,
      contextSnippets: keySnippets,
      confidence: (authorityScore + freshnessScore) / 2
    };
  }

  /**
   */
  private async validateDocument(
    document: EnhancedDocument,
    query: string
  ): Promise<boolean> {
    // 检查文档长度
    if (document.pageContent.length < 50) {
      return false;
    }
    
    // 检查相关性
    if (document.relevanceScore < 0.3) {
      return false;
    }
    
    // 检查权威性
    if (document.metadata.authority < 0.3) {
      return false;
    }
    
    // 使用LLM验证文档是否回答查询
    const prompt = `
      ${document.pageContent.substring(0, 500)}
      
      ${query}
      
      {
        "relevant": true/false,
        "reason": "判断理由"
      }
    `;
    
    try {
      const response = await this.rerankLlm.invoke(prompt);
      const result = JSON.parse(response.content as string);
      return result.relevant;
    } catch (error) {
      // 验证失败时默认通过
      return true;
    }
  }

  /**
   */
  private async generateSuggestedQuestions(
    documents: EnhancedDocument[],
    query: string,
    context: any
  ): Promise<string[]> {
    if (documents.length === 0) {
      return [];
    }
    
    try {
      // 从文档中提取关键信息
      const keyInfo = documents
        .slice(0, 3)
        .map(doc => doc.pageContent.substring(0, 200))
        .join('\n\n');
      
      const prompt = `
        
        用户查询：${query}
        
        ${keyInfo}
        
        ${JSON.stringify(context.customerProfile || {}, null, 2)}
        
        
        {
          "questions": ["问题1", "问题2", "问题3"]
        }
      `;
      
      const response = await this.llm.invoke(prompt);
      const result = JSON.parse(response.content as string);
      return result.questions || [];
    } catch (error) {
      logger.error('生成建议问题失败:', error);
      return [];
    }
  }

  /**
   */
  private async evaluateRetrievalQuality(
    documents: EnhancedDocument[],
    query: string,
    context: any
  ): Promise<{
    confidence: number;
    reasoning: string;
    metrics: Record<string, number>;
  }> {
    if (documents.length === 0) {
      return {
        confidence: 0,
        reasoning: '未找到相关文档',
        metrics: {
          coverage: 0,
          diversity: 0,
          relevance: 0,
          freshness: 0
        }
      };
    }
    
    // 计算各种指标
    const metrics = {
      coverage: this.calculateCoverage(documents, query),      // 覆盖度
      diversity: this.calculateDiversity(documents),           // 多样性
      relevance: this.calculateAverageRelevance(documents),    // 相关性
      freshness: this.calculateAverageFreshness(documents)     // 新鲜度
    };
    
    // 综合置信度
    const confidence = (
      metrics.coverage * 0.3 +
      metrics.diversity * 0.2 +
      metrics.relevance * 0.4 +
      metrics.freshness * 0.1
    );
    
    // 生成评估理由
    const reasoning = this.generateEvaluationReasoning(metrics, documents.length);
    
    return {
      confidence,
      reasoning,
      metrics
    };
  }

  /**
   */
  private async fallbackRetrieval(query: string): Promise<EnhancedDocument[]> {
    logger.warn('使用降级检索方案:', query);
    
    // 简单的向量检索
    const vectorStore = this.vectorStores.get('default');
    if (!vectorStore) {
      return [];
    }
    
    const results = await vectorStore.similaritySearch(query, 5);
    
    return results.map(doc => ({
      ...doc,
      relevanceScore: 0.5,
      confidence: 0.3,
      reasoning: '降级检索结果'
    } as EnhancedDocument));
  }

  /**
   */
  
  private async getQueryEmbedding(query: string): Promise<number[]> {
    const cacheKey = `embedding:${Buffer.from(query).toString('base64')}`;
    
    // 检查内存缓存
    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }
    
    // 检查Redis缓存
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const embedding = JSON.parse(cached);
      this.embeddingCache.set(cacheKey, embedding);
      return embedding;
    }
    
    // 生成新嵌入
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'text-embedding-3-small'
    });
    
    const embedding = await embeddings.embedQuery(query);
    
    // 缓存结果
    this.embeddingCache.set(cacheKey, embedding);
    await this.redis.setex(cacheKey, 3600, JSON.stringify(embedding)); // 缓存1小时
    
    return embedding;
  }

  private buildFilters(storeName: string, filters?: Record<string, any>): any {
    const baseFilter: any = {};
    
    if (filters) {
      if (filters.category) {
        baseFilter.category = filters.category;
      }
      if (filters.minFreshness) {
        baseFilter.freshness = { $gte: filters.minFreshness };
      }
    }
    
    return baseFilter;
  }

  private extractKeywords(text: string): string[] {
    // 简单的关键词提取
    const stopWords = new Set(['的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '也']);
    const words = text
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ')
      .split(' ')
      .filter(word => word.length > 1 && !stopWords.has(word));
    
    return [...new Set(words)];
  }

  private extractEntities(text: string): string[] {
    // 简单的实体提取（实际应该用NER模型）
    const entityPatterns = [
    ];
    
    const entities: Set<string> = new Set();
    for (const pattern of entityPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => entities.add(match));
      }
    }
    
    return Array.from(entities);
  }

  private generateDocumentId(doc: Document): string {
    const contentHash = require('crypto')
      .createHash('md5')
      .update(doc.pageContent)
      .digest('hex')
      .substring(0, 8);
    
    return `${doc.metadata.source || 'unknown'}_${contentHash}`;
  }

  private async extractKeySnippets(content: string, query: string): Promise<string[]> {
    // 提取与查询相关的关键片段
    const sentences = content.split(/[。！？.!?]/);
    const queryKeywords = this.extractKeywords(query);
    
    const relevantSentences = sentences
      .filter(sentence => {
        const sentenceLower = sentence.toLowerCase();
        return queryKeywords.some(keyword => 
          sentenceLower.includes(keyword.toLowerCase())
        );
      })
      .slice(0, 3); // 最多3个片段
    
    return relevantSentences;
  }

  private calculateAuthorityScore(metadata: any): number {
    let score = 0.5; // 基础分
    
    // 来源权威性
    if (metadata.source?.includes('official')) score += 0.3;
    if (metadata.source?.includes('doctor')) score += 0.2;
    
    // 类别权威性
    if (metadata.category === 'certification') score += 0.2;
    if (metadata.category === 'procedure') score += 0.1;
    
    // 标签权威性
    const tags = metadata.tags || [];
    if (tags.includes('权威认证')) score += 0.1;
    if (tags.includes('临床验证')) score += 0.1;
    
    return Math.min(score, 1.0);
  }

  private calculateFreshnessScore(updatedAt?: string): number {
    if (!updatedAt) return 0.5;
    
    const updateDate = new Date(updatedAt);
    const now = new Date();
    const daysDiff = (now.getTime() - updateDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysDiff < 30) return 1.0;    // 1个月内
    if (daysDiff < 90) return 0.8;    // 3个月内
    if (daysDiff < 180) return 0.6;   // 6个月内
    if (daysDiff < 365) return 0.4;   // 1年内
    return 0.2;                       // 超过1年
  }

  private async extractRelatedConcepts(content: string): Promise<string[]> {
    // 使用LLM提取相关概念
    const prompt = `
      
      内容：${content.substring(0, 500)}
      
      {
        "concepts": ["概念1", "概念2", "概念3", "概念4", "概念5"]
      }
    `;
    
    try {
      const response = await this.rerankLlm.invoke(prompt);
      const result = JSON.parse(response.content as string);
      return result.concepts || [];
    } catch (error) {
      return [];
    }
  }

  private calculateCoverage(documents: EnhancedDocument[], query: string): number {
    // 计算查询关键词的覆盖度
    const queryKeywords = this.extractKeywords(query);
    if (queryKeywords.length === 0) return 0.5;
    
    const allContent = documents
      .map(doc => doc.pageContent.toLowerCase())
      .join(' ');
    
    const coveredKeywords = queryKeywords.filter(keyword =>
      allContent.includes(keyword.toLowerCase())
    );
    
    return coveredKeywords.length / queryKeywords.length;
  }

  private calculateDiversity(documents: EnhancedDocument[]): number {
    if (documents.length <= 1) return 1.0;
    
    // 计算文档来源的多样性
    const sources = documents.map(doc => doc.metadata.source || 'unknown');
    const uniqueSources = new Set(sources).size;
    
    // 计算类别的多样性
    const categories = documents.map(doc => doc.metadata.category || 'unknown');
    const uniqueCategories = new Set(categories).size;
    
    return (uniqueSources / documents.length + uniqueCategories / documents.length) / 2;
  }

  private calculateAverageRelevance(documents: EnhancedDocument[]): number {
    if (documents.length === 0) return 0;
    
    const totalScore = documents.reduce((sum, doc) => sum + (doc.relevanceScore || 0), 0);
    return totalScore / documents.length;
  }

  private calculateAverageFreshness(documents: EnhancedDocument[]): number {
    if (documents.length === 0) return 0;
    
    const totalFreshness = documents.reduce((sum, doc) => 
      sum + (doc.metadata.freshness || 0.5), 0
    );
    
    return totalFreshness / documents.length;
  }

  private generateEvaluationReasoning(metrics: Record<string, number>, docCount: number): string {
    const parts: string[] = [];
    
    parts.push(`找到 ${docCount} 篇相关文档`);
    
    if (metrics.coverage >= 0.8) {
      parts.push('查询关键词覆盖完整');
    } else if (metrics.coverage >= 0.5) {
      parts.push('查询关键词覆盖较好');
    } else {
      parts.push('查询关键词覆盖不足');
    }
    
    if (metrics.relevance >= 0.8) {
      parts.push('文档相关性高');
    } else if (metrics.relevance >= 0.6) {
      parts.push('文档相关性中等');
    } else {
      parts.push('文档相关性一般');
    }
    
    if (metrics.freshness >= 0.8) {
      parts.push('文档时效性良好');
    }
    
    return parts.join('；');
  }

  /**
   */
  
  async addToKnowledgeBase(
    content: string,
    metadata: {
      title: string;
      category: string;
      tags: string[];
      source: string;
      author?: string;
      updatedAt?: string;
    }
  ): Promise<void> {
    // 1. 分割文档
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    
    const chunks = await splitter.createDocuments([content], [metadata]);
    
    // 2. 添加到向量存储
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'text-embedding-3-small'
    });
    
    const vectorStore = await Chroma.fromDocuments(
      chunks,
      embeddings,
      {
        collectionName: 'med_beauty_enhanced',
        url: process.env.CHROMA_URL || 'http://localhost:8000'
      }
    );
    
    // 3. 更新知识图谱
    if (this.knowledgeGraph) {
      await this.updateKnowledgeGraph(content, metadata);
    }
    
    // 4. 更新检索配置
    await this.updateRetrievalConfig();
    
    logger.info(`知识库更新完成: ${metadata.title}`, {
      chunks: chunks.length,
      category: metadata.category
    });
  }

  private async updateKnowledgeGraph(
    content: string,
    metadata: any
  ): Promise<void> {
    if (!this.knowledgeGraph) return;
    
    // 提取实体
    const entities = this.extractEntities(content);
    
    // 创建知识图谱节点
    const nodeId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const cypher = `
      CREATE (d:Document {
        id: $nodeId,
        title: $title,
        content: $content,
        category: $category,
        source: $source,
        createdAt: datetime()
      })
      WITH d
      UNWIND $entities AS entityName
      MERGE (e:Entity {name: entityName})
      MERGE (d)-[:MENTIONS]->(e)
      RETURN d, collect(e) as entities
    `;
    
    // await this.knowledgeGraph.query(cypher, {
    //   nodeId,
    //   title: metadata.title,
    //   content: content.substring(0, 500),
    //   category: metadata.category,
    //   source: metadata.source,
    //   entities
    // });
    
    logger.debug('知识图谱更新:', { title: metadata.title, entities: entities.length });
  }

  private async updateRetrievalConfig(): Promise<void> {
    // 动态调整检索策略
    // 可以根据知识库的变化调整权重
    
    // 示例：如果有大量新内容，增加时间敏感搜索的权重
    const recentDocCount = 0; // 需要从数据库获取
    
    if (recentDocCount > 50) {
      const temporalStage = this.retrievalStages.find(s => s.name === 'temporal_search');
      if (temporalStage) {
        temporalStage.weight = Math.min(temporalStage.weight + 0.1, 0.3);
        logger.info('调整时间敏感搜索权重:', temporalStage.weight);
      }
    }
  }

  /**
   */
  
  async diagnoseRetrieval(query: string): Promise<any> {
    const diagnosis = {
      query,
      timestamp: new Date().toISOString(),
      stages: [] as any[],
      recommendations: [] as string[]
    };
    
    // 分析查询
    const queryKeywords = this.extractKeywords(query);
    const queryEntities = this.extractEntities(query);
    
    diagnosis.stages.push({
      name: 'query_analysis',
      keywords: queryKeywords,
      entities: queryEntities,
      score: queryKeywords.length > 0 ? 1.0 : 0.0
    });
    
    // 测试每个检索阶段
    for (const stage of this.retrievalStages) {
      if (!stage.enabled) continue;
      
      try {
        const results = await this.executeRetrievalStage(stage, query, {}, queryEntities);
        
        diagnosis.stages.push({
          name: stage.name,
          enabled: stage.enabled,
          weight: stage.weight,
          resultsCount: results.length,
          score: results.length > 0 ? 1.0 : 0.0
        });
      } catch (error) {
        diagnosis.stages.push({
          name: stage.name,
          enabled: stage.enabled,
          error: error.message,
          score: 0.0
        });
      }
    }
    
    // 生成建议
    if (queryKeywords.length === 0) {
      diagnosis.recommendations.push('查询缺少关键词，建议提供更具体的信息');
    }
    
    if (diagnosis.stages.every(s => s.resultsCount === 0)) {
      diagnosis.recommendations.push('所有检索阶段都未找到结果，建议检查知识库内容');
    }
    
    return diagnosis;
  }

  async getStatistics(): Promise<any> {
    const stats = {
      vectorStores: Array.from(this.vectorStores.keys()).length,
      knowledgeGraphConnected: !!this.knowledgeGraph,
      retrievalStages: this.retrievalStages.map(s => ({
        name: s.name,
        enabled: s.enabled,
        weight: s.weight
      })),
      cacheHits: this.embeddingCache.size,
      lastDiagnosis: null as any
    };
    
    return stats;
  }
}

// 单例模式导出
export const advancedRAGService = new AdvancedRAGService();