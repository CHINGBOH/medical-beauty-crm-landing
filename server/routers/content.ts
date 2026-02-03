import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { getActiveKnowledge, createContentPost, getContentPosts } from "../db";
import { getActiveContactWay } from "../wework-db";
import { generateImage } from "../_core/imageGeneration";

const CONTENT_GENERATION_PROMPT = `你是一位专业的小红书医美内容创作者，擅长撰写吸引人的医美项目推广文案。



- 不要承诺100%效果`;

export const contentRouter = router({
  /**
   */
  generate: publicProcedure
    .input(
      z.object({
        type: z.enum(["project", "case", "price", "guide", "holiday"]),
        project: z.string().optional(),
        keywords: z.array(z.string()).optional(),
        tone: z.enum(["enthusiastic", "professional", "casual"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { type, project, keywords, tone = "enthusiastic" } = input;

      // 获取相关知识库内容
      const knowledgeItems = await getActiveKnowledge();
      let relevantKnowledge = knowledgeItems;

      // 根据项目筛选知识库
      if (project) {
        relevantKnowledge = knowledgeItems.filter(
          (k) =>
            k.title.includes(project) ||
            k.content.includes(project) ||
            (k.tags && k.tags.includes(project))
        );
      }

      // 构建知识库上下文
      const knowledgeContext =
        relevantKnowledge.length > 0
          ? "\n\n参考知识库：\n" +
            relevantKnowledge
              .slice(0, 5)
              .map((k) => `【${k.title}】\n${k.content}`)
              .join("\n\n")
          : "";

      // 根据类型构建提示词
      let typePrompt = "";
      switch (type) {
        case "project":
          typePrompt = `请生成一篇关于"${project || "医美项目"}"的体验分享文案。以第一人称叙述，分享真实的治疗过程、效果和感受。`;
          break;
        case "case":
          typePrompt = `请生成一篇关于"${project || "医美项目"}"的效果对比文案。重点突出治疗前后的变化，用数据和细节增强说服力。`;
          break;
        case "price":
          typePrompt = `请生成一篇关于"${project || "医美项目"}"的价格揭秘文案。透明化价格信息，帮助读者了解市场行情，避免被坑。`;
          break;
        case "guide":
          typePrompt = `请生成一篇关于"${project || "医美项目"}"的避坑指南文案。分享选择机构、医生、项目的经验和注意事项。`;
          break;
        case "holiday":
          typePrompt = `请生成一篇节日营销文案，结合"${project || "医美项目"}"，制造紧迫感和优惠吸引力。`;
          break;
      }

      // 添加关键词
      if (keywords && keywords.length > 0) {
        typePrompt += `\n\n必须包含以下关键词：${keywords.join("、")}`;
      }

      // 添加语气要求
      const toneMap = {
        enthusiastic: "语气要热情洋溢，充满激情",
        professional: "语气要专业严谨，值得信赖",
        casual: "语气要轻松随意，像朋友聊天",
      };
      typePrompt += `\n\n${toneMap[tone]}。`;

      // 调用 LLM 生成内容
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: CONTENT_GENERATION_PROMPT + knowledgeContext,
          },
          {
            role: "user",
            content: typePrompt,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "xiaohongshu_content",
            strict: true,
            schema: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "小红书标题，需要吸引眼球，包含emoji",
                },
                content: {
                  type: "string",
                  description: "正文内容，结构清晰，包含emoji",
                },
                tags: {
                  type: "array",
                  description: "话题标签，以#开头",
                  items: {
                    type: "string",
                  },
                },
              },
              required: ["title", "content", "tags"],
              additionalProperties: false,
            },
          },
        },
      });

      const contentString = typeof response.choices[0].message.content === 'string' 
        ? response.choices[0].message.content 
        : JSON.stringify(response.choices[0].message.content);
      const generatedContent = JSON.parse(contentString || "{}");
      const contactWay = await getActiveContactWay().catch(() => null);
      const qrBlock = contactWay?.qrCode
        ? `\n\n📲 想了解更多或预约咨询，可添加企业微信：\n${contactWay.qrCode}\n（备注：小红书咨询）`
        : "";

      return {
        title: generatedContent.title,
        content: `${generatedContent.content || ""}${qrBlock}`,
        tags: generatedContent.tags,
      };
    }),

  /**
   */
  generateImage: publicProcedure
    .input(
      z.object({
        title: z.string(),
        content: z.string(),
        project: z.string().optional(),
        style: z.enum(["modern", "elegant", "vibrant"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { title, content, project, style = "modern" } = input;

      // 构建图片生成 prompt
      const styleMap = {
        modern: "现代简约风格，干净清爽的背景，柔和的色调",
        elegant: "优雅高级风格，奢华质感，金色或粉色调",
        vibrant: "活力鲜艳风格，明亮色彩，年轻时尚",
      };

      const imagePrompt = `Create a professional medical beauty promotional image for Xiaohongshu (Little Red Book). 

Project: ${project || "medical beauty"}
Title: ${title}

Style: ${styleMap[style]}

Requirements:
- Include subtle medical beauty elements (like skincare products, treatment equipment)
- Suitable for social media sharing

Color palette: Soft pinks, whites, golds, or pastels depending on the style.`;

      try {
        const result = await generateImage({
          prompt: imagePrompt,
        });

        return {
          url: result.url,
        };
      } catch (error) {
        console.error("Image generation failed:", error);
        throw new Error("图片生成失败，请稍后重试");
      }
    }),
  /**
   */
  saveDraft: publicProcedure
    .input(
      z.object({
        title: z.string(),
        content: z.string(),
        tags: z.array(z.string()).optional(),
        projectType: z.string().optional(),
        images: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      return await createContentPost({
        title: input.title,
        content: input.content,
        tags: input.tags ? JSON.stringify(input.tags) : null,
        projectType: input.projectType || null,
        images: input.images ? JSON.stringify(input.images) : null,
        status: "draft",
      });
    }),

  /**
   */
  list: publicProcedure
    .input(
      z.object({
        status: z.enum(["draft", "published"]).optional(),
        limit: z.number().default(20),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }) => {
      return await getContentPosts(input.status, input.limit, input.offset);
    }),
});
