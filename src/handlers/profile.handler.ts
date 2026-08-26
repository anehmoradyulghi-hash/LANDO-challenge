import { prisma } from "@/database/prisma";
import type { BotContext } from "@/types/context";
import { countWinsForUser } from "@/repositories/winner.repository";
import { Markup } from "telegraf";

export async function showProfile(ctx: BotContext) {
  const userId = ctx.dbUser.id;

  const [aggregates, joinedCount, wins] = await Promise.all([
    prisma.challengeParticipant.aggregate({
      where: { userId, status: "ACTIVE" },
      _sum: { totalPoints: true, verifiedReferrals: true, ticketCount: true },
    }),
    prisma.challengeParticipant.count({ where: { userId, status: "ACTIVE" } }),
    countWinsForUser(userId),
  ]);

  const text = [
    "👤 پروفایل",
    "",
    `⭐ Points: ${(aggregates._sum.totalPoints ?? 0).toLocaleString("fa-IR")}`,
    `👥 Verified Referral: ${(aggregates._sum.verifiedReferrals ?? 0).toLocaleString("fa-IR")}`,
    `🎟 Tickets: ${(aggregates._sum.ticketCount ?? 0).toLocaleString("fa-IR")}`,
    `🎯 Challenges Joined: ${joinedCount.toLocaleString("fa-IR")}`,
    `🏆 Wins: ${wins.toLocaleString("fa-IR")}`,
  ].join("\n");

  await ctx.reply(text, Markup.inlineKeyboard([[Markup.button.callback("🏆 بردهای من", "profile:wins")]]));
}

export async function showMyWins(ctx: BotContext) {
  const wins = await prisma.challengeWinner.findMany({
    where: { userId: ctx.dbUser.id },
    include: { challenge: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  if (wins.length === 0) {
    await ctx.answerCbQuery();
    await ctx.reply("🏆 بردهای من\n\nهنوز برنده هیچ چالشی نشده‌اید.");
    return;
  }

  await ctx.answerCbQuery();
  const lines = wins.map(
    (w) => `🏆 ${w.challenge.name} — رتبه #${w.rank}${w.prizeAmount ? ` — ${w.prizeAmount.toLocaleString("fa-IR")} ⭐️` : ""}`
  );
  await ctx.reply(["🏆 بردهای من", "", ...lines].join("\n"));
}
