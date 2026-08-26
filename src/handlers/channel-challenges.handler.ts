import { Markup } from "telegraf";
import type { BotContext } from "@/types/context";
import { assertOwnsChannel } from "@/services/authorization.service";
import { listChallengesForCreator } from "@/repositories/challenge.repository";

const CATEGORY_LABEL: Record<string, string> = {
  ACTIVE: "🟢 فعال",
  SCHEDULED: "🟡 آینده",
  ENDED: "⚫ تمام‌شده",
  SETTLED: "⚫ تمام‌شده",
  CANCELLED: "🔴 لغوشده",
  DRAFT: "📝 پیش‌نویس",
  ENDING: "🟢 فعال",
};

export async function showChannelChallenges(ctx: BotContext, channelId: string) {
  const channel = await assertOwnsChannel(channelId, ctx.dbUser.id).catch(() => null);
  if (!channel) {
    await ctx.answerCbQuery("این کانال متعلق به شما نیست", { show_alert: true });
    return;
  }
  await ctx.answerCbQuery();

  const all = await listChallengesForCreator(ctx.dbUser.id);
  const scoped = all.filter((c) => c.channelId === channel.id);

  if (scoped.length === 0) {
    await ctx.reply("📊 هنوز چالشی برای این کانال ساخته نشده است.");
    return;
  }

  await ctx.reply(
    "📊 Challengeهای این کانال:",
    Markup.inlineKeyboard(scoped.map((c) => [Markup.button.callback(`${CATEGORY_LABEL[c.status] ?? ""} ${c.name}`, `cc:view:${c.id}`)]))
  );
}
