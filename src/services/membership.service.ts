import { bot } from "@/bot/bot";
import { logger } from "@/utils/logger";
import type { Channel } from "@prisma/client";

const VALID_STATUSES = new Set(["member", "administrator", "creator"]);

export interface MembershipResult {
  channel: Channel;
  isMember: boolean;
}

/** Checks whether a user is currently a member/admin/creator of a single channel (section 31). */
export async function checkMembership(
  channel: Channel,
  telegramUserId: bigint
): Promise<boolean> {
  try {
    const member = await bot.telegram.getChatMember(
      channel.telegramChatId.toString(),
      Number(telegramUserId)
    );
    return VALID_STATUSES.has(member.status);
  } catch (err) {
    // If Telegram can't answer (e.g. bot lost admin rights), fail closed - treat as not a member.
    logger.warn({ err, channelId: channel.id, telegramUserId }, "checkMembership failed");
    return false;
  }
}

/** Checks a user against ALL required channels of a challenge; returns the ones they still need to join. */
export async function checkAllRequiredChannels(
  requiredChannels: Channel[],
  telegramUserId: bigint
): Promise<{ allJoined: boolean; missing: Channel[] }> {
  const results = await Promise.all(
    requiredChannels.map(async (channel) => ({
      channel,
      isMember: await checkMembership(channel, telegramUserId),
    }))
  );
  const missing = results.filter((r) => !r.isMember).map((r) => r.channel);
  return { allJoined: missing.length === 0, missing };
}
