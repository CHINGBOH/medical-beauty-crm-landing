import axios from "axios";

const QWEN_API_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const QWEN_API_KEY = process.env.QWEN_API_KEY || "";

export interface QwenMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface QwenResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 */
export async function callQwen(messages: QwenMessage[]): Promise<string> {
  if (!QWEN_API_KEY) {
    throw new Error("QWEN_API_KEY is not configured");
  }

  try {
    const response = await axios.post<QwenResponse>(
      QWEN_API_URL,
      {
        model: "qwen-plus", // 使用 qwen-plus 模型，性能和成本平衡
        messages,
        temperature: 0.7,
        max_tokens: 2000,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${QWEN_API_KEY}`,
        },
        timeout: 30000,
      }
    );

    const content = response.data.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from Qwen API");
    }

    return content;
  } catch (error: any) {
    console.error("[Qwen API Error]", error.response?.data || error.message);
    throw new Error(
      `Qwen API call failed: ${error.response?.data?.error?.message || error.message}`
    );
  }
}

/**
 */
export async function analyzeLeadsData(leadsData: any[]): Promise<string> {
  const prompt = `你是一个专业的医美行业数据分析师。请分析以下线索数据，生成一份详细的转化率报告。

${JSON.stringify(leadsData, null, 2)}


请用专业、清晰的语言输出报告，使用 Markdown 格式。`;

  return await callQwen([
    {
      role: "system",
      content: "你是一个专业的医美行业数据分析师，擅长分析客户数据并提供商业洞察。",
    },
    {
      role: "user",
      content: prompt,
    },
  ]);
}

/**
 */
export async function generateCustomerProfile(
  conversationHistory: string,
  leadInfo: any
): Promise<string> {
  const prompt = `你是一个专业的医美客户画像分析师。请根据以下信息生成详细的客户画像。

${conversationHistory}

${JSON.stringify(leadInfo, null, 2)}


请用专业、实用的语言输出，使用 Markdown 格式。`;

  return await callQwen([
    {
      role: "system",
      content: "你是一个专业的医美客户画像分析师，擅长理解客户需求并提供精准的营销建议。",
    },
    {
      role: "user",
      content: prompt,
    },
  ]);
}

/**
 */
export async function generateMarketingSuggestions(
  leadsData: any[],
  performanceData: any
): Promise<string> {
  const prompt = `你是一个医美行业营销专家。请根据以下数据生成营销优化建议。

${JSON.stringify(leadsData.slice(0, 10), null, 2)}

${JSON.stringify(performanceData, null, 2)}


请用实用、可执行的语言输出，使用 Markdown 格式。`;

  return await callQwen([
    {
      role: "system",
      content: "你是一个医美行业营销专家，擅长制定数据驱动的营销策略。",
    },
    {
      role: "user",
      content: prompt,
    },
  ]);
}
