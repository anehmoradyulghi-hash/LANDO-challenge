import { bot } from "@/bot/bot";
import { ChannelAccessStatus } from "@prisma/client";
import { logger } from "@/utils/logger";

export interface ChannelVerificationResult {
  ok: boolean;
  status: ChannelAccessStatus;
  telegramChatId?: bigint;
  username?: string | null;
  title?: string | null;
  reason?: string;
}

/**
 * Verifies a channel using only real, documented Telegram Bot API calls:
 *  - getChat            -> does the channel exist / can we resolve it?
 *  - getChatMember(bot)  -> is the bot an administrator?
 *  - getChatMember(user) -> is the requesting creator an administrator?
 *
 * There is no Bot API method to list "all channels a user administers" -
 * that is why the creator must supply the channel handle themselves (section 3).
 */
export async function verifyChannel(
  chatIdOrUsername: string,
  requestingUserTelegramId: bigint
): Promise<ChannelVerificationResult> {
  let chat;
  try {
    chat = await bot.telegram.getChat(chatIdOrUsername);
  } catch (err) {
    logger.warn({ err, chatIdOrUsername }, "getChat failed");
    return { ok: false, status: ChannelAccessStatus.NOT_FOUND, reason: "CHAT_NOT_FOUND" };
  }

  if (chat.type !== "channel") {
    return { ok: false, status: ChannelAccessStatus.NOT_FOUND, reason: "NOT_A_CHANNEL" };
  }

  // Is the bot an admin, and can it post?
  let botMember;
  try {
    const me = await bot.telegram.getMe();
    botMember = await bot.telegram.getChatMember(chat.id, me.id);
  } catch (err) {
    logger.warn({ err, chatId: chat.id }, "getChatMember(bot) failed");
    return { ok: false, status: ChannelAccessStatus.BOT_NOT_ADMIN, reason: "BOT_NOT_IN_CHANNEL" };
  }

  if (botMember.status !== "administrator" && botMember.status !== "creator") {
    return { ok: false, status: ChannelAccessStatus.BOT_NOT_ADMIN, reason: "BOT_NOT_ADMIN" };
  }

  if (botMember.status === "administrator" && botMember.can_post_messages === false) {
    return {
      ok: false,
      status: ChannelAccessStatus.BOT_NO_POST_PERMISSION,
      reason: "BOT_CANNOT_POST",
    };
  }

  // Is the requesting creator an admin of this channel?
  let ownerMember;
  try {
    ownerMember = await bot.telegram.getChatMember(chat.id, Number(requestingUserTelegramId));
  } catch (err) {
    logger.warn({ err, chatId: chat.id }, "getChatMember(owner) failed");
    return { ok: false, status: ChannelAccessStatus.OWNER_NOT_ADMIN, reason: "OWNER_NOT_ADMIN" };
  }

  if (ownerMember.status !== "administrator" && ownerMember.status !== "creator") {
    return { ok: false, status: ChannelAccessStatus.OWNER_NOT_ADMIN, reason: "OWNER_NOT_ADMIN" };
  }

  return {
    ok: true,
    status: ChannelAccessStatus.OK,
    telegramChatId: BigInt(chat.id),
    username: "username" in chat ? chat.username ?? null : null,
    title: "title" in chat ? chat.title ?? null : null,
  };
}

/**
 * Lighter verification used when adding a REQUIRED channel to a challenge (section 9).
 * A required channel does not have to be owned by this creator, but the bot must at
 * least be a member so membership checks (section 31) are possible later.
 */
export async function verifyChannelForRequirement(
  chatIdOrUsername: string
): Promise<ChannelVerificationResult> {
  let chat;
  try {
    chat = await bot.telegram.getChat(chatIdOrUsername);
  } catch (err) {
    logger.warn({ err, chatIdOrUsername }, "getChat failed (requirement)");
    return { ok: false, status: ChannelAccessStatus.NOT_FOUND, reason: "CHAT_NOT_FOUND" };
  }

  if (chat.type !== "channel") {
    return { ok: false, status: ChannelAccessStatus.NOT_FOUND, reason: "NOT_A_CHANNEL" };
  }

  try {
    const me = await bot.telegram.getMe();
    await bot.telegram.getChatMember(chat.id, me.id);
  } catch (err) {
    logger.warn({ err, chatId: chat.id }, "bot cannot read membership of requirement channel");
    return { ok: false, status: ChannelAccessStatus.BOT_NOT_ADMIN, reason: "BOT_CANNOT_READ_MEMBERSHIP" };
  }

  return {
    ok: true,
    status: ChannelAccessStatus.OK,
    telegramChatId: BigInt(chat.id),
    username: "username" in chat ? chat.username ?? null : null,
    title: "title" in chat ? chat.title ?? null : null,
  };
}

/** Lightweight re-check used by "🔄 بررسی دسترسی" (section 7) - only checks the bot's own status. */
export async function recheckBotAccess(telegramChatId: bigint): Promise<ChannelAccessStatus> {
  try {
    const me = await bot.telegram.getMe();
    const member = await bot.telegram.getChatMember(telegramChatId.toString(), me.id);
    if (member.status !== "administrator" && member.status !== "creator") {
      return ChannelAccessStatus.BOT_NOT_ADMIN;
    }
    if (member.status === "administrator" && member.can_post_messages === false) {
      return ChannelAccessStatus.BOT_NO_POST_PERMISSION;
    }
    return ChannelAccessStatus.OK;
  } catch (err) {
    logger.warn({ err, telegramChatId }, "recheckBotAccess failed");
    return ChannelAccessStatus.UNKNOWN_ERROR;
  }
}
