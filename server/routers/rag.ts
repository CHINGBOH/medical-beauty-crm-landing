import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { getActiveKnowledge } from "../db";
import { invokeLLM } from "../_core/llm";

export const ragRouter = router({
  ask: publicProcedure
    .input(
      z.object({
        question: z.string().min(1),
        type: z.enum(["customer", "internal"]).optional(),
        category: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const knowledge = await getActiveKnowledge(input.category, input.type);
      const context = knowledge
        .slice(0, 5)
        .map((k) => `【${k.title}】\n${k.content}`)
        .join("\n\n");

      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `你是医美知识库助手，请基于给定知识库回答问题。\n\n知识库：\n${context}`,
          },
          {
            role: "user",
            content: input.question,
          },
        ],
      });

      return {
        answer: response.choices[0]?.message?.content || "",
        used: knowledge.slice(0, 5).map((k) => k.id),
      };
    }),
});
