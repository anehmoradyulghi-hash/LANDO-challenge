import { Markup } from "telegraf";

export const MAIN_MENU_TEXT = "به TeleChallenge خوش آمدید 👋\nیکی از گزینه‌های زیر را انتخاب کنید:";

export const mainMenuKeyboard = Markup.keyboard([
  ["🎯 چالش‌های من", "➕ ساخت چالش"],
  ["📢 کانال‌های من", "🏆 لیدربوردها"],
  ["👤 پروفایل", "📖 راهنما"],
]).resize();

export const backCancelRow = () =>
  Markup.inlineKeyboard([
    Markup.button.callback("🔙 بازگشت", "wz:back"),
    Markup.button.callback("❌ لغو", "wz:cancel"),
  ]);
