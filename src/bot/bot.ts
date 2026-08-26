import { Telegraf } from "telegraf";
import { env } from "@/config/env";
import type { BotContext } from "@/types/context";

export const bot = new Telegraf<BotContext>(env.BOT_TOKEN, {
  handlerTimeout: 15_000,
});
