import { Context } from "telegraf";
import { Update } from "telegraf/typings/core/types/typegram";
import type { User as DbUser } from "@prisma/client";

export interface BotContext extends Context<Update> {
  /** Loaded/created by auth.middleware on every update. Always present after middleware runs. */
  dbUser: DbUser;
}
