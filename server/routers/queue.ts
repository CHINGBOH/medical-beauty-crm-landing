import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { coreQueueService } from "../extensions/core/queue/core-queue.service";
import { businessQueueService } from "../extensions/services/queue/business-queue.service";

let initialized = false;

async function ensureInitialized() {
  if (initialized) return;
  await coreQueueService.initialize();
  await businessQueueService.initialize();
  initialized = true;
}

export const queueRouter = router({
  init: publicProcedure.mutation(async () => {
    await ensureInitialized();
    return { ok: true };
  }),

  status: publicProcedure.query(async () => {
    await ensureInitialized();
    const status = await coreQueueService.getAllQueueStatus();
    return status;
  }),

  enqueueContent: publicProcedure
    .input(
      z.object({
        projectType: z.string(),
        contentType: z.string(),
        tone: z.string(),
        keywords: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      await ensureInitialized();
      const result = await businessQueueService.generateContentAsync({
        projectType: input.projectType,
        contentType: input.contentType,
        tone: input.tone,
        keywords: input.keywords,
      });
      return result;
    }),
});
