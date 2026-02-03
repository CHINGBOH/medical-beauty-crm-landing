/**
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


   - 行为特征：急于改善现状，容易被"再不做就晚了"打动





- **A级**：高消费 + 容易被影响（贪婪型/敏感型）= 高价值高转化
- **B级**：高消费或中消费且非安全型 = 中高价值
- **C级**：中消费或低消费但贪婪型 = 中等价值
- **D级**：其他 = 低价值

请分析以下对话内容，返回 JSON 格式的分析结果。`;

/**
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
 */
export function shouldAnalyzePsychology(messageCount: number): boolean {
  // 第5条消息时首次分析
  // 之后每10条消息重新分析一次
  return messageCount === 5 || (messageCount > 5 && messageCount % 10 === 0);
}
