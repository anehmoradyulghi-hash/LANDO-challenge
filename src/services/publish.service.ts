import { Markup } from "telegraf";
import { bot } from "@/bot/bot";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import { buildChallengePostText } from "@/utils/format";
import {
  upsertPendingPost,
  markPostPublished,
  markPostFailed,
  listPostsForChallenge,
} from "@/repositories/post.repository";
import { countActiveParticipants } from "@/repositories/participant.repository";
import type { Challenge, Channel } from "@prisma/client";

function joinDeepLink(challenge: Challenge): string {
  return `https://t.me/${env.BOT_USERNAME}?start=challenge_${challenge.publicToken}`;
}

async function publishToSingleChannel(challenge: Challenge, channel: Channel) {
  const post = await upsertPendingPost(challenge.id, channel.id);
  const participantCount = await countActiveParticipants(challenge.id);
  const text = buildChallengePostText(challenge, participantCount);
  const keyboard = Markup.inlineKeyboard([
    Markup.button.url("🎯 شرکت در چالش", joinDeepLink(challenge)),
  ]);

  try {
    const message = await bot.telegram.sendMessage(
      channel.telegramChatId.toString(),
      text,
      keyboard
    );
    await markPostPublished(post.id, BigInt(message.message_id));
    return { channel, ok: true as const };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "UNKNOWN_ERROR";
    logger.warn({ err, channelId: channel.id }, "Failed to publish challenge post");
    await markPostFailed(post.id, reason);
    return { channel, ok: false as const, reason };
  }
}

/**
 * Publishes to every required channel of the challenge. A failure on one channel
 * (e.g. @ChannelC) never blocks the others (section 53).
 */
export async function publishChallengeToAllChannels(
  challenge: Challenge,
  requiredChannels: Channel[]
) {
  const results = await Promise.all(
    requiredChannels.map((channel) => publishToSingleChannel(challenge, channel))
  );
  return results;
}

/** Republish only the channels currently in FAILED state (section 53: "🔄 انتشار مجدد"). */
export async function republishFailed(challenge: Challenge, allRequiredChannels: Channel[]) {
  const posts = await listPostsForChallenge(challenge.id);
  const failedChannelIds = new Set(
    posts.filter((p) => p.status === "FAILED").map((p) => p.channelId)
  );
  const targets = allRequiredChannels.filter((c) => failedChannelIds.has(c.id));
  if (targets.length === 0) return [];
  return publishChallengeToAllChannels(challenge, targets);
}
