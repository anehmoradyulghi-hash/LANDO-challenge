import type { BotContext } from "@/types/context";
import { showMyChallenges } from "@/handlers/creator-challenges.handler";
import { startWizard } from "@/handlers/wizard.handler";
import { showMyChannels } from "@/handlers/channel.handler";
import { showProfile } from "@/handlers/profile.handler";
import { Markup } from "telegraf";

const HELP_TEXT = [
  "📖 راهنما",
  "",
  "با این Bot می‌توانید برای کانال خود Challenge، Leaderboard یا Giveaway بسازید:",
  "",
  "۱. از «📢 کانال‌های من» کانال خود را اضافه و تأیید کنید.",
  "۲. از «➕ ساخت چالش» یک چالش جدید بسازید.",
  "۳. چالش را در کانال‌های اجباری منتشر کنید.",
  "۴. کاربران از طریق دکمه داخل پست شرکت می‌کنند و امتیاز/رفرال/تیکت جمع می‌کنند.",
  "۵. در پایان، در صورت فعال بودن Winner، برندگان به‌صورت خودکار مشخص و اعلام می‌شوند.",
].join("\n");

/** Handles the fixed reply-keyboard buttons shown by /start (section 5). Returns true if handled. */
export async function handleMainMenuText(ctx: BotContext, text: string): Promise<boolean> {
  switch (text) {
    case "🎯 چالش‌های من":
      await showMyChallenges(ctx);
      return true;
    case "➕ ساخت چالش":
      await startWizard(ctx);
      return true;
    case "📢 کانال‌های من":
      await showMyChannels(ctx);
      return true;
    case "🏆 لیدربوردها":
      await ctx.reply(
        "🏆 برای دیدن لیدربورد یک چالش خاص، از «🎯 چالش‌های من» وارد آن چالش شوید.",
        Markup.inlineKeyboard([[Markup.button.callback("🎯 چالش‌های من", "cc:mychallenges")]])
      );
      return true;
    case "👤 پروفایل":
      await showProfile(ctx);
      return true;
    case "📖 راهنما":
      await ctx.reply(HELP_TEXT);
      return true;
    default:
      return false;
  }
}
