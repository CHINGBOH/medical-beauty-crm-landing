import dotenv from "dotenv";

dotenv.config();

export const config = {
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || "",
  qwenApiKey: process.env.QWEN_API_KEY || "",
  qweatherApiKey: process.env.QWEATHER_API_KEY || "",
  weworkCorpId: process.env.WEWORK_CORP_ID || "",
  weworkSecret: process.env.WEWORK_SECRET || "",
  weworkToken: process.env.WEWORK_TOKEN || "",
  weworkAesKey: process.env.WEWORK_AES_KEY || "",
  redisHost: process.env.REDIS_HOST || "localhost",
  redisPort: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
  pineconeApiKey: process.env.PINECONE_API_KEY || "",
  pineconeIndex: process.env.PINECONE_INDEX || "",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
};
