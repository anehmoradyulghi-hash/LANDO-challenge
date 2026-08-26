import { bot } from "@/bot/bot";
import { logger } from "@/utils/logger";
import { listWinners, markWinnersAnnounced } from "@/repositories/winner.repository";
import type { Challenge, Channel } from "@prisma/client";

const medal = (rank: number) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}️⃣`);

function buildAnnouncementText(challenge: Challenge, winners: Awaited<ReturnType<typeof listWinners>>): string {
  const lines = [`🏆 نتایج «${challenge.name}» اعلام شد!`, ""];
  if (winners.length === 0) {
    lines.push("متأسفانه شرکت‌کننده واجد شرایطی برای برنده شدن یافت نشد.");
  } else {
    for (const w of winners) {
      const name = w.user.username ? `@${w.user.username}` : w.user.firstName ?? "کاربر";
      const prize = w.prizeAmount ? ` — ${w.prizeAmount.toLocaleString("fa-IR")} ⭐️` : "";
      lines.push(`${medal(w.rank)} ${name}${prize}`);
    }
  }
  lines.push("", "🎉 با تشکر از همه شرکت‌کنندگان!");
  return lines.join("\n");
}

/** Announces winners (if any were selected) in every channel the challenge was published to. */
export async function announceWinnersToChannels(challenge: Challenge, channels: Channel[]) {
  const winners = await listWinners(challenge.id);
  const text = buildAnnouncementText(challenge, winners);

  for (const channel of channels) {
    try {
      await bot.telegram.sendMessage(channel.telegramChatId.toString(), text);
    } catch (err) {
      logger.warn({ err, channelId: channel.id }, "Failed to announce winners in channel");
    }
  }

  if (winners.length > 0) {
    await markWinnersAnnounced(challenge.id);
  }
}
