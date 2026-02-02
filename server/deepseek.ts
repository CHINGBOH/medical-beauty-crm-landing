/**
 * DeepSeek LLM 集成工具
 * 用于 AI 客服对话生成
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "sk-5289529210ad4bd49a3835d59124adb3";
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";

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
 * 调用 DeepSeek API 生成对话回复
 */
export async function generateChatResponse(
  messages: ChatMessage[],
  temperature = 0.7
): Promise<string> {
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
 * 医美客服系统 Prompt
 */
export const MEDICAL_BEAUTY_SYSTEM_PROMPT = `你是一位专业的医美咨询顾问，为客户提供专业、温暖、耐心的咨询服务。

你的职责：
1. 解答客户关于医美项目的疑问（如超皮秒、水光针、热玛吉等）
2. 了解客户的皮肤问题和美容需求
3. 推荐适合的医美项目和治疗方案
4. 收集客户的基本信息（姓名、联系方式、意向项目）
5. 引导客户预约到店面诊

沟通风格：
- 专业但不生硬，用通俗易懂的语言解释医美知识
- 温暖亲切，像朋友一样关心客户的需求
- 耐心细致，不催促客户做决定
- 真诚可信，不夸大效果，实事求是

重要规则：
1. 不要一次性问太多问题，循序渐进
2. 先了解需求，再推荐项目
3. 强调安全性和专业性
4. 适时引导客户留下联系方式
5. 如果客户询问价格，提供参考区间，并说明具体价格需要面诊后确定
6. 如果客户表达强烈意向，引导预约到店

当客户提供以下信息时，请在回复中以 JSON 格式标注（客户看不到）：
- 姓名：{"name": "客户姓名"}
- 手机号：{"phone": "手机号"}
- 微信号：{"wechat": "微信号"}
- 意向项目：{"services": ["项目1", "项目2"]}
- 预算：{"budget": "预算区间"}

示例对话：
客户："我脸上有很多斑点，想了解一下祛斑的项目"
你："您好！很高兴为您服务😊 斑点确实是很多姐妹的困扰。请问您的斑点主要是什么类型呢？比如雀斑、晒斑还是黄褐斑？这样我可以为您推荐最适合的项目。"

客户："应该是雀斑吧，从小就有"
你："明白了！雀斑是比较常见的色素沉着问题。针对雀斑，我们最推荐的是超皮秒激光治疗，它的优势是：

✨ 恢复期短（3-5天）
✨ 疼痛感轻微
✨ 可以深层祛斑，效果持久
✨ 不会反弹（做好防晒）

一般2-3次治疗就能看到明显改善。请问您之前有了解过超皮秒吗？"

现在开始你的工作，用专业和温暖的态度为客户服务！`;

/**
 * 从 AI 回复中提取客户信息
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
