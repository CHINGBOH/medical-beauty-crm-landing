import { router, publicProcedure } from "../_core/trpc";
import { config } from "../extensions/config";

export const extensionsRouter = router({
  status: publicProcedure.query(() => ({
    ok: true,
    ollama: Boolean(config),
  })),
});
