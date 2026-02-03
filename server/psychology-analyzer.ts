/**
 * 心理标签自动识别模块
 * 使用 LLM 分析客户对话内容，自动识别客户的心理动机和决策类型
 */

import { invokeLLM } from "./_core/llm";

export interface PsychologyAnalysisResult {
  psychologyType: "恐惧型" | "贪婪型" | "安全型" | "敏感型";
  psychologyTags: string[];
  confidence: number; // 0-1之间，表示识别的置信度
  reasoning: string; // 分析推理过程
  budgetLevel?: "低" | "中" | "高";
  customerTier?: "A" | "B" | "C" | "D";
}

const PSYCHOLOGY_ANALYSIS_PROMPT = `你是一位专业的医美行业客户心理分析师。请根据客户的对话内容，分析客户的心理类型和决策动机。

**心理类型定义：**

1. **恐惧型**：害怕变老、变丑、被比下去，担心失去吸引力
   - 关键词：怕、担心、焦虑、衰老、皱纹、斑点、下垂
   - 行为特征：急于改善现状，容易被"再不做就晚了"打动

2. **贪婪型**：追求极致效果和性价比，希望花最少的钱达到最好的效果
   - 关键词：效果、性价比、优惠、套餐、对比、最好
   - 行为特征：会货比三家，关注优惠活动，追求高性价比

3. **安全型**：注重风险和安全性，要权威认证和保障
   - 关键词：安全、风险、副作用、恢复期、资质、认证
   - 行为特征：谨慎决策，需要大量信息支持，重视医生资质

4. **敏感型**：在意他人评价和社交压力，希望获得认可
   - 关键词：别人、朋友、同事、评价、羡慕、自信
   - 行为特征：容易被社交证明影响，关注他人反馈

**消费能力判断：**
- **低**（2K-5K）：预算有限，关注性价比，询问优惠活动
- **中**（5K-15K）：预算适中，关注效果和安全，理性消费
- **高**（15K-50K）：预算充足，追求品质，不太在意价格

**客户分层判断：**
- **A级**：高消费 + 容易被影响（贪婪型/敏感型）= 高价值高转化
- **B级**：高消费或中消费且非安全型 = 中高价值
- **C级**：中消费或低消费但贪婪型 = 中等价值
- **D级**：其他 = 低价值

请分析以下对话内容，返回 JSON 格式的分析结果。`;

/**
 * 分析客户心理类型
 */
export async function analyzePsychology(
  conversationMessages: Array<{ role: string; content: string }>
): Promise<PsychologyAnalysisResult> {
  // 构建对话摘要
  const conversationSummary = conversationMessages
    .map((m) => `${m.role === "user" ? "客户" : "客服"}：${m.content}`)
    .join("\n");

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: PSYCHOLOGY_ANALYSIS_PROMPT },
        {
          role: "user",
          content: `请分析以下对话内容：\n\n${conversationSummary}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "psychology_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              psychologyType: {
                type: "string",
                enum: ["恐惧型", "贪婪型", "安全型", "敏感型"],
                description: "客户的心理类型",
              },
              psychologyTags: {
                type: "array",
                items: { type: "string" },
                description: "客户的心理标签（3-5个关键词）",
              },
              confidence: {
                type: "number",
                description: "识别置信度（0-1之间）",
              },
              reasoning: {
                type: "string",
                description: "分析推理过程",
              },
              budgetLevel: {
                type: "string",
                enum: ["低", "中", "高"],
                description: "消费能力判断",
              },
              customerTier: {
                type: "string",
                enum: ["A", "B", "C", "D"],
                description: "客户分层",
              },
            },
            required: [
              "psychologyType",
              "psychologyTags",
              "confidence",
              "reasoning",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new Error("No response from LLM");
    }

    const result = JSON.parse(content) as PsychologyAnalysisResult;
    return result;
  } catch (error) {
    console.error("[Psychology Analyzer] Analysis failed:", error);
    // 返回默认值
    return {
      psychologyType: "贪婪型",
      psychologyTags: ["待分析"],
      confidence: 0,
      reasoning: "分析失败，使用默认值",
    };
  }
}

/**
 * 判断是否需要更新心理标签
 * 当对话消息数量达到一定阈值时，触发心理分析
 */
export function shouldAnalyzePsychology(messageCount: number): boolean {
  // 第5条消息时首次分析
  // 之后每10条消息重新分析一次
  return messageCount === 5 || (messageCount > 5 && messageCount % 10 === 0);
}
