import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { DataPipeline } from "../extensions/pipelines/data-pipeline";

export const pipelineRouter = router({
  process: publicProcedure
    .input(
      z.object({
        source: z.string(),
        target: z.string(),
        data: z.any(),
      })
    )
    .mutation(async ({ input }) => {
      const pipeline = new DataPipeline();
      // Minimal pass-through: register empty schema to allow processing
      pipeline.registerSchema({
        id: `${input.source}_${input.target}`,
        version: 1,
        schema: { type: "record", name: "Generic", fields: [] },
        source: input.source,
        target: input.target,
        transformations: [],
      });

      const result = await pipeline.processData(input.source, input.target, input.data, 1);
      return { result };
    }),
});
