import { Markup } from "telegraf";
import type { BotContext } from "@/types/context";
import { ChallengeStatus } from "@prisma/client";
import { listChallengesForCreator, findChallengeById } from "@/repositories/challenge.repository";
import { assertOwnsChallenge } from "@/services/authorization.service";
import { countActiveParticipants } from "@/repositories/participant.repository";
import { listPostsForChallenge } from "@/repositories/post.repository";
import { republishFailed } from "@/services/publish.service";
import { listWinners } from "@/repositories/winner.repository";
import { countVerifiedReferrals } from "@/repositories/referral.repository";

const CATEGORY_LABEL: Record<string, string> = {
  ACTIVE: "🟢 فعال",
  SCHEDULED: "🟡 آینده",
  ENDED: "⚫ تمام‌شده",
  SETTLED: "⚫ تمام‌شده",
  CANCELLED: "🔴 لغوشده",
  DRAFT: "📝 پیش‌نویس",
  ENDING: "🟢 فعال",
};

export async function showMyChallenges(ctx: BotContext) {
  const challenges = await listChallengesForCreator(ctx.dbUser.id);
  if (challenges.length === 0) {
    await ctx.reply("🎯 هنوز چالشی نساخته‌اید.", Markup.inlineKeyboard([[Markup.button.callback("➕ ساخت چالش", "wz:start")]]));
    return;
  }

  const buttons = challenges.map((c) => [
    Markup.button.callback(`${CATEGORY_LABEL[c.status] ?? ""} ${c.name}`, `cc:view:${c.id}`),
  ]);
  await ctx.reply("🎯 چالش‌های من", Markup.inlineKeyboard(buttons));
}

export async function showChallengeManagement(ctx: BotContext, challengeId: string) {
  const challenge = await assertOwnsChallenge(challengeId, ctx.dbUser.id).catch(() => null);
  if (!challenge) {
    await ctx.answerCbQuery("این چالش متعلق به شما نیست", { show_alert: true });
    return;
  }
  await ctx.answerCbQuery();

  await ctx.reply(
    `${CATEGORY_LABEL[challenge.status] ?? ""} ${challenge.name}`,
    Markup.inlineKeyboard([
      [Markup.button.callback("📊 آمار", `cc:stats:${challenge.id}`)],
      [Markup.button.callback("🏆 لیدربورد", `lb:points:${challenge.publicToken}:0`)],
      [Markup.button.callback("👥 Referral", `lb:ref:${challenge.publicToken}:0`)],
      [Markup.button.callback("📢 وضعیت Postها", `cc:posts:${challenge.id}`)],
      [Markup.button.callback("🏆 Winnerها", `cc:winners:${challenge.id}`)],
    ])
  );
}

export async function showChallengeStats(ctx: BotContext, challengeId: string) {
  const challenge = await assertOwnsChallenge(challengeId, ctx.dbUser.id).catch(() => null);
  if (!challenge) {
    await ctx.answerCbQuery("این چالش متعلق به شما نیست", { show_alert: true });
    return;
  }
  await ctx.answerCbQuery();

  const participants = await countActiveParticipants(challenge.id);
  await ctx.reply(
    ["📊 آمار", "", `👥 Participants: ${participants.toLocaleString("fa-IR")}`].join("\n")
  );
}

export async function showChallengePosts(ctx: BotContext, challengeId: string) {
  const challenge = await assertOwnsChallenge(challengeId, ctx.dbUser.id).catch(() => null);
  if (!challenge) {
    await ctx.answerCbQuery("این چالش متعلق به شما نیست", { show_alert: true });
    return;
  }
  await ctx.answerCbQuery();

  const posts = await listPostsForChallenge(challenge.id);
  const icon = (s: string) => (s === "PUBLISHED" ? "✅" : s === "FAILED" ? "❌" : "⏳");
  const lines = posts.map((p) => `${p.channel.username ? "@" + p.channel.username : p.channel.title} ${icon(p.status)}`);

  const hasFailed = posts.some((p) => p.status === "FAILED");
  await ctx.reply(
    ["📢 وضعیت Postها", "", ...lines].join("\n"),
    hasFailed ? Markup.inlineKeyboard([[Markup.button.callback("🔄 انتشار مجدد", `cc:republish:${challenge.id}`)]]) : undefined
  );
}

export async function handleRepublish(ctx: BotContext, challengeId: string) {
  const challenge = await assertOwnsChallenge(challengeId, ctx.dbUser.id).catch(() => null);
  if (!challenge) {
    await ctx.answerCbQuery("این چالش متعلق به شما نیست", { show_alert: true });
    return;
  }
  const full = await findChallengeById(challenge.id);
  if (!full) return;

  const results = await republishFailed(
    full,
    full.requiredChannels.map((rc) => rc.channel)
  );
  const succeeded = results.filter((r) => r.ok).length;
  await ctx.answerCbQuery(`✅ ${succeeded} کانال با موفقیت منتشر شد`, { show_alert: true });
}

export async function showChallengeWinners(ctx: BotContext, challengeId: string) {
  const challenge = await assertOwnsChallenge(challengeId, ctx.dbUser.id).catch(() => null);
  if (!challenge) {
    await ctx.answerCbQuery("این چالش متعلق به شما نیست", { show_alert: true });
    return;
  }
  await ctx.answerCbQuery();

  if (!challenge.winnerEnabled) {
    await ctx.reply("🏆 این چالش بدون Winner تنظیم شده است.");
    return;
  }
  if (challenge.status !== ChallengeStatus.SETTLED) {
    await ctx.reply("⏱ Winnerها پس از پایان چالش مشخص می‌شوند.");
    return;
  }

  const winners = await listWinners(challenge.id);
  const medal = (rank: number) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}️⃣`);
  const lines = winners.map((w) => {
    const name = w.user.username ? `@${w.user.username}` : w.user.firstName ?? "کاربر";
    const prize = w.prizeAmount ? ` — ${w.prizeAmount.toLocaleString("fa-IR")} ⭐️` : "";
    return `${medal(w.rank)} ${name}${prize}`;
  });
  await ctx.reply(["🏆 Winnerها", "", ...(lines.length ? lines : ["برنده‌ای ثبت نشد."])].join("\n"));
}

// Kept for completeness / future use by other handlers needing per-referrer verified count.
export { countVerifiedReferrals };
