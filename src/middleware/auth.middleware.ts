import type { MiddlewareFn } from "telegraf";
import type { BotContext } from "@/types/context";
import { upsertUserFromTelegram } from "@/repositories/user.repository";

export const authMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  const from = ctx.from;
  if (!from) return next();

  ctx.dbUser = await upsertUserFromTelegram({
    telegramUserId: BigInt(from.id),
    username: from.username ?? null,
    firstName: from.first_name ?? null,
    lastName: from.last_name ?? null,
    languageCode: from.language_code ?? null,
    isBot: from.is_bot,
  });

  return next();
};
