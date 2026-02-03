import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import { leads, conversations, messages, knowledgeBase } from "../../drizzle/schema";
import { eq, and, gte, lte, like, sql, desc } from "drizzle-orm";

/**
 * 管理端 AI 助手 Router
 * 让管理员可以用自然语言查询数据库
 */

export const adminAiRouter = router({
  /**
   * AI 查询数据库
   */
  query: protectedProcedure
    .input(
      z.object({
        question: z.string().min(1).max(500),
      })
    )
    .mutation(async ({ input }) => {
      const { question } = input;

      // 第一步：使用 LLM 分析用户问题，生成查询计划
      const analysisResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `你是一个医美 CRM 系统的数据分析助手。你的任务是理解管理员的自然语言问题，并生成查询计划。

数据库表结构：
1. leads（客户线索表）
   - name: 姓名
   - phone: 手机号
   - wechat: 微信号
   - source: 来源渠道（小红书、抖音、微信朋友圈等）
   - interestedServices: 兴趣项目（JSON数组）
   - budget: 预算
   - psychologyType: 心理类型（fear恐惧型、greed贪婪型、safety安全型、sensitive敏感型）
   - consumptionLevel: 消费能力（low低、medium中、high高）
   - customerTier: 客户分层（A、B、C、D）
   - psychologyTags: 心理标签（JSON数组）
   - createdAt: 创建时间

2. conversations（对话会话表）
   - visitorName: 访客姓名
   - visitorPhone: 访客手机
   - messageCount: 消息数量
   - detectedPsychologyType: 检测到的心理类型
   - detectedMotivations: 检测到的动机（JSON数组）
   - createdAt: 创建时间

3. knowledge_base（知识库表）
   - title: 标题
   - content: 内容
   - category: 分类
   - type: 类型（customer_inquiry客户问询、internal_management内部管理）
   - usageCount: 使用次数

请分析用户问题，返回 JSON 格式的查询计划：
{
  "queryType": "客户查询 | 对话查询 | 统计查询 | 知识库查询",
  "tables": ["需要查询的表"],
  "conditions": ["查询条件描述"],
  "aggregations": ["聚合统计描述"],
  "timeRange": "时间范围描述"
}`,
          },
          {
            role: "user",
            content: question,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "query_plan",
            strict: true,
            schema: {
              type: "object",
              properties: {
                queryType: {
                  type: "string",
                  description: "查询类型",
                },
                tables: {
                  type: "array",
                  items: { type: "string" },
                  description: "需要查询的表",
                },
                conditions: {
                  type: "array",
                  items: { type: "string" },
                  description: "查询条件描述",
                },
                aggregations: {
                  type: "array",
                  items: { type: "string" },
                  description: "聚合统计描述",
                },
                timeRange: {
                  type: "string",
                  description: "时间范围描述",
                },
              },
              required: ["queryType", "tables", "conditions", "aggregations", "timeRange"],
              additionalProperties: false,
            },
          },
        },
      });

      const content = analysisResponse.choices[0].message.content;
      const queryPlan = JSON.parse(typeof content === 'string' ? content : JSON.stringify(content));

      // 第二步：根据查询计划执行数据库查询
      const dbInstance = await getDb();
      if (!dbInstance) {
        throw new Error("数据库未初始化");
      }

      let queryResult: any = null;

      // 根据查询类型执行不同的查询
      if (queryPlan.tables.includes("leads")) {
        // 客户查询
        const results = await dbInstance.select().from(leads).limit(100);
        queryResult = {
          type: "客户列表",
          data: results,
          count: results.length,
        };
      } else if (queryPlan.tables.includes("conversations")) {
        // 对话查询
        const results = await dbInstance.select().from(conversations).limit(100);
        queryResult = {
          type: "对话列表",
          data: results,
          count: results.length,
        };
      }

      // 第三步：使用 LLM 生成自然语言回答
      const questionText = `问题：${question}\n\n查询计划：${JSON.stringify(queryPlan, null, 2)}\n\n查询结果：${JSON.stringify(queryResult, null, 2)}`;
      
      const answerResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "你是一个医美 CRM 系统的数据分析助手。根据查询结果，用自然语言回答管理员的问题。\n\n要求：\n1. 用清晰、专业的语言描述查询结果\n2. 如果有统计数据，用数字和百分比展示\n3. 如果有列表数据，突出关键信息\n4. 给出可操作的建议",
          },
          {
            role: "user",
            content: questionText,
          },
        ],
      });

      const answer = answerResponse.choices[0].message.content;

      return {
        question,
        queryPlan,
        queryResult,
        answer,
      };
    }),

  /**
   * 获取 AI 助手对话历史
   */
  getHistory: protectedProcedure.query(async () => {
    // TODO: 实现对话历史记录
    return [];
  }),
});
