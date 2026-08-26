import { logger } from "@/utils/logger";
import { initBot } from "@/bot/index";
import { startServer } from "@/server";
import { startScheduler } from "@/jobs/scheduler";
import { disconnectPrisma } from "@/database/prisma";

async function main() {
  await initBot();
  const server = await startServer();
  startScheduler();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down...");
    try {
      await server.close();
      await disconnectPrisma();
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "Fatal error during startup");
  process.exit(1);
});
