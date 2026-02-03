import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import {
  createKnowledge,
  getAllKnowledge,
  getKnowledgeById,
  updateKnowledge,
  deleteKnowledge,
  getActiveKnowledge,
} from "../db";

export const knowledgeRouter = router({
  /**
   */
  getAll: protectedProcedure
    .input(
      z.object({
        type: z.enum(["customer", "internal"]).optional(),
      })
    )
    .query(async ({ input }) => {
      const knowledge = await getAllKnowledge(input.type);
      return knowledge;
    }),

  /**
   */
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const knowledge = await getKnowledgeById(input.id);
      if (!knowledge) {
        throw new Error("Knowledge not found");
      }
      return knowledge;
    }),

  /**
   */
  create: protectedProcedure
    .input(
      z.object({
        type: z.enum(["customer", "internal"]),
        title: z.string().min(1),
        content: z.string().min(1),
        category: z.string().min(1),
        tags: z.array(z.string()).optional(),
        isActive: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      await createKnowledge({
        type: input.type,
        title: input.title,
        content: input.content,
        category: input.category,
        tags: input.tags ? JSON.stringify(input.tags) : null,
        isActive: input.isActive ?? 1,
      });

      return { success: true };
    }),

  /**
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        type: z.enum(["customer", "internal"]).optional(),
        title: z.string().min(1).optional(),
        content: z.string().min(1).optional(),
        category: z.string().min(1).optional(),
        tags: z.array(z.string()).optional(),
        isActive: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, tags, ...rest } = input;

      const updateData: any = { ...rest };
      if (tags !== undefined) {
        updateData.tags = JSON.stringify(tags);
      }

      await updateKnowledge(id, updateData);

      return { success: true };
    }),

  /**
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteKnowledge(input.id);
      return { success: true };
    }),

  /**
   */
  getActive: publicProcedure
    .input(
      z.object({
        category: z.string().optional(),
        type: z.enum(["customer", "internal"]).optional(),
      })
    )
    .query(async ({ input }) => {
      const knowledge = await getActiveKnowledge(input.category, input.type);
      return knowledge;
    }),
});
