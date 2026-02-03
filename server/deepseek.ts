/**
 */

import { ENV } from "./_core/env";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const OLLAMA_BASE_URL = ENV.ollamaBaseUrl;
const OLLAMA_MODEL = ENV.ollamaModel;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionResponse {
  id: string;
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
export async function generateChatResponse(
  messages: ChatMessage[],
  temperature = 0.7
): Promise<string> {
  if (OLLAMA_BASE_URL) {
    const response = await fetch(`${OLLAMA_BASE_URL.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        messages,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data?.message?.content || "";
  }

  if (!DEEPSEEK_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY is not configured");
  }

  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages,
      temperature,
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DeepSeek API error: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  return data.choices[0]?.message.content || "";
}

/**
 */
export const MEDICAL_BEAUTY_SYSTEM_PROMPT = `你是一位专业的医美咨询顾问，为客户提供专业、温暖、耐心的咨询服务。




- 姓名：{"name": "客户姓名"}
- 手机号：{"phone": "手机号"}
- 微信号：{"wechat": "微信号"}
- 意向项目：{"services": ["项目1", "项目2"]}
- 预算：{"budget": "预算区间"}

客户："我脸上有很多斑点，想了解一下祛斑的项目"
你："您好！很高兴为您服务😊 斑点确实是很多姐妹的困扰。请问您的斑点主要是什么类型呢？比如雀斑、晒斑还是黄褐斑？这样我可以为您推荐最适合的项目。"

客户："应该是雀斑吧，从小就有"
你："明白了！雀斑是比较常见的色素沉着问题。针对雀斑，我们最推荐的是超皮秒激光治疗，它的优势是：


一般2-3次治疗就能看到明显改善。请问您之前有了解过超皮秒吗？"

现在开始你的工作，用专业和温暖的态度为客户服务！`;

/**
 */
export function extractCustomerInfo(content: string): {
  name?: string;
  phone?: string;
  wechat?: string;
  services?: string[];
  budget?: string;
} | null {
  // 尝试从回复中提取 JSON 标注的信息
  const jsonMatch = content.match(/\{[^}]*"(name|phone|wechat|services|budget)"[^}]*\}/g);
  if (!jsonMatch) return null;

  const extracted: Record<string, unknown> = {};
  for (const match of jsonMatch) {
    try {
      const data = JSON.parse(match);
      Object.assign(extracted, data);
    } catch {
      // 忽略解析错误
    }
  }

  return Object.keys(extracted).length > 0 ? (extracted as ReturnType<typeof extractCustomerInfo>) : null;
}
