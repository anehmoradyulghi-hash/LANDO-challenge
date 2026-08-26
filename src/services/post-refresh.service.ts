import { bot } from "@/bot/bot";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import { buildChallengePostText } from "@/utils/format";
import { listPublishedPosts, updateParticipantCountShown } from "@/repositories/post.repository";
import { countActiveParticipants } from "@/repositories/participant.repository";
import type { Challenge } from "@prisma/client";

/**
 * Section 51: never edit the Telegram message on every single join. Instead this is
 * invoked periodically by the scheduler and only actually calls editMessageText when
 * enough time has passed AND the participant count moved by a meaningful amount.
 */
export async function refreshParticipantCountsIfDue(challenge: Challenge) {
  const posts = await listPublishedPosts(challenge.id);
  if (posts.length === 0) return;

  const currentCount = await countActiveParticipants(challenge.id);
  const now = Date.now();

  for (const post of posts) {
    const delta = Math.abs(currentCount - post.lastParticipantCountShown);
    const dueByTime =
      !post.lastEditedAt ||
      now - post.lastEditedAt.getTime() >= env.PARTICIPANT_COUNT_UPDATE_DEBOUNCE_MS;
    const dueByDelta = delta >= env.PARTICIPANT_COUNT_UPDATE_MIN_DELTA;

    if (!post.telegramMessageId || !(dueByTime && dueByDelta)) continue;

    try {
      const text = buildChallengePostText(challenge, currentCount);
      await bot.telegram.editMessageText(
        post.channel.telegramChatId.toString(),
        Number(post.telegramMessageId),
        undefined,
        text
      );
      await updateParticipantCountShown(post.id, currentCount);
    } catch (err) {
      // Editing can legitimately fail (message deleted, identical content, etc.) - non-fatal.
      logger.debug({ err, postId: post.id }, "Participant count edit skipped/failed");
    }
  }
}
