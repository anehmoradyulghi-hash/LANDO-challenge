import Fastify from "fastify";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import { bot } from "@/bot/bot";

export function buildServer() {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ ok: true }));

  app.post(env.WEBHOOK_PATH, async (request, reply) => {
    const secret = request.headers["x-telegram-bot-api-secret-token"];
    if (secret !== env.WEBHOOK_SECRET) {
      logger.warn({ ip: request.ip }, "Rejected webhook call with invalid secret token");
      return reply.code(401).send({ ok: false });
    }

    try {
      await bot.handleUpdate(request.body as any);
      return reply.code(200).send({ ok: true });
    } catch (err) {
      logger.error({ err }, "Failed to process Telegram update");
      // Still return 200 so Telegram doesn't endlessly retry a poison update.
      return reply.code(200).send({ ok: false });
    }
  });

  return app;
}

export async function startServer() {
  const app = buildServer();
  await app.listen({ host: env.HOST, port: env.PORT });
  logger.info({ port: env.PORT, host: env.HOST }, "HTTP server listening");
  return app;
}
