import { Markup } from "telegraf";
import type { BotContext } from "@/types/context";
import { env } from "@/config/env";
import { ChannelAccessStatus } from "@prisma/client";
import {
  listChannelsForOwner,
  countChannelsForOwner,
  createOrRestoreChannel,
  findChannelById,
  updateChannelAccessStatus,
  softDeleteChannel,
} from "@/repositories/channel.repository";
import { verifyChannel, recheckBotAccess } from "@/services/channel-verification.service";
import { setPendingInput, clearPendingInput } from "@/repositories/pending-input.repository";
import { assertOwnsChannel } from "@/services/authorization.service";
import { listChallengesForCreator } from "@/repositories/challenge.repository";

const statusIcon = (status: ChannelAccessStatus) => (status === ChannelAccessStatus.OK ? "✅" : "⚠️");

export async function showMyChannels(ctx: BotContext) {
  const channels = await listChannelsForOwner(ctx.dbUser.id);
  if (channels.length === 0) {
    await ctx.reply(
      "📢 هنوز کانالی ثبت نکرده‌اید.",
      Markup.inlineKeyboard([[Markup.button.callback("➕ افزودن کانال", "ch:add")]])
    );
    return;
  }

  const lines = channels.map((c) => `${c.username ? "@" + c.username : c.title ?? c.telegramChatId.toString()} ${statusIcon(c.accessStatus)}`);
  const buttons = channels.map((c) => [
    Markup.button.callback(
      `${c.username ? "@" + c.username : c.title ?? "کانال"} ${statusIcon(c.accessStatus)}`,
      `ch:view:${c.id}`
    ),
  ]);
  buttons.push([Markup.button.callback("➕ افزودن کانال", "ch:add")]);

  await ctx.reply(["📢 کانال‌های من", "", ...lines].join("\n"), Markup.inlineKeyboard(buttons));
}

export async function showChannelDetail(ctx: BotContext, channelId: string) {
  const channel = await assertOwnsChannel(channelId, ctx.dbUser.id).catch(() => null);
  if (!channel) {
    await ctx.answerCbQuery("این کانال متعلق به شما نیست", { show_alert: true });
    return;
  }
  await ctx.answerCbQuery();

  const label = channel.username ? `@${channel.username}` : channel.title ?? "کانال";
  const challenges = await listChallengesForCreator(ctx.dbUser.id);
  const challengeCount = challenges.filter((c) => c.channelId === channel.id).length;

  await ctx.reply(
    [`📢 ${label}`, `وضعیت دسترسی: ${statusIcon(channel.accessStatus)}`, `تعداد Challenge: ${challengeCount.toLocaleString("fa-IR")}`].join("\n"),
    Markup.inlineKeyboard([
      [Markup.button.callback("📊 Challengeها", `ch:challenges:${channel.id}`)],
      [Markup.button.callback("🔄 بررسی دسترسی", `ch:recheck:${channel.id}`)],
      [Markup.button.callback("🗑 حذف", `ch:delete:${channel.id}`)],
    ])
  );
}

export async function beginAddChannel(ctx: BotContext) {
  const count = await countChannelsForOwner(ctx.dbUser.id);
  if (count >= env.MAX_CHANNELS_PER_CREATOR) {
    await ctx.answerCbQuery("⚠️ به حداکثر تعداد کانال مجاز رسیده‌اید.", { show_alert: true });
    return;
  }
  await ctx.answerCbQuery();
  await setPendingInput(ctx.dbUser.id, "ADD_CHANNEL");
  await ctx.reply("📢 آیدی یا Username کانال را ارسال کنید.\n\nمثلاً: @mychannel");
}

export async function handleAddChannelText(ctx: BotContext, handle: string) {
  await clearPendingInput(ctx.dbUser.id);

  const result = await verifyChannel(handle.trim(), ctx.dbUser.telegramUserId);

  if (!result.ok) {
    const messages: Record<string, string> = {
      CHAT_NOT_FOUND: "❌ کانال پیدا نشد. لطفاً آیدی یا Username را بررسی کنید.",
      NOT_A_CHANNEL: "❌ این یک کانال نیست.",
      BOT_NOT_IN_CHANNEL: "❌ ابتدا Bot را Administrator کانال کنید.",
      BOT_NOT_ADMIN: "❌ ابتدا Bot را Administrator کانال کنید.",
      BOT_CANNOT_POST: "❌ Bot دسترسی ارسال پیام در این کانال را ندارد.",
      OWNER_NOT_ADMIN: "❌ شما Administrator این کانال نیستید.",
    };
    await ctx.reply(messages[result.reason ?? ""] ?? "❌ تأیید کانال ناموفق بود.");
    return;
  }

  await createOrRestoreChannel({
    ownerId: ctx.dbUser.id,
    telegramChatId: result.telegramChatId!,
    username: result.username ?? null,
    title: result.title ?? null,
    accessStatus: ChannelAccessStatus.OK,
  });

  await ctx.reply(`✅ کانال ${result.username ? "@" + result.username : result.title} با موفقیت افزوده شد.`);
}

export async function handleRecheckChannel(ctx: BotContext, channelId: string) {
  const channel = await assertOwnsChannel(channelId, ctx.dbUser.id).catch(() => null);
  if (!channel) {
    await ctx.answerCbQuery("این کانال متعلق به شما نیست", { show_alert: true });
    return;
  }
  const status = await recheckBotAccess(channel.telegramChatId);
  await updateChannelAccessStatus(channel.id, status);
  await ctx.answerCbQuery(status === ChannelAccessStatus.OK ? "✅ دسترسی معتبر است" : "⚠️ مشکلی در دسترسی وجود دارد", {
    show_alert: true,
  });
}

export async function handleDeleteChannel(ctx: BotContext, channelId: string) {
  const channel = await assertOwnsChannel(channelId, ctx.dbUser.id).catch(() => null);
  if (!channel) {
    await ctx.answerCbQuery("این کانال متعلق به شما نیست", { show_alert: true });
    return;
  }
  // section 7: soft delete only - historical challenge/channel links are preserved
  await softDeleteChannel(channel.id);
  await ctx.answerCbQuery("🗑 کانال حذف شد");
  await ctx.reply("کانال از لیست شما حذف شد. سابقه Challengeهای قبلی حفظ می‌شود.");
}
