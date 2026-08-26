import { bot } from "@/bot/bot";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import { authMiddleware } from "@/middleware/auth.middleware";
import { handleStart } from "@/commands/start.command";
import { registerCallbackRouter } from "@/callbacks/callback-router";
import { registerTextRouter } from "@/handlers/text-router";

export async function initBot() {
  bot.use(authMiddleware);

  bot.command("start", handleStart);
  bot.command("help", async (ctx) => {
    const { handleMainMenuText } = await import("@/handlers/menu.handler");
    await handleMainMenuText(ctx, "📖 راهنما");
  });

  registerCallbackRouter();
  registerTextRouter();

  bot.catch((err, ctx) => {
    logger.error({ err, updateType: ctx.updateType }, "Unhandled Telegraf error");
  });

  await bot.telegram.setWebhook(`${env.WEBHOOK_DOMAIN}${env.WEBHOOK_PATH}`, {
    secret_token: env.WEBHOOK_SECRET,
  });
  logger.info({ url: `${env.WEBHOOK_DOMAIN}${env.WEBHOOK_PATH}` }, "Webhook registered with Telegram");
}
