import { prisma } from "@/database/prisma";
import type { User } from "@prisma/client";

interface TelegramUserInput {
  telegramUserId: bigint;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  languageCode?: string | null;
  isBot?: boolean;
}

/** Upserts a user on every /start or interaction (section 4). Stores only necessary fields. */
export async function upsertUserFromTelegram(input: TelegramUserInput): Promise<User> {
  return prisma.user.upsert({
    where: { telegramUserId: input.telegramUserId },
    create: {
      telegramUserId: input.telegramUserId,
      username: input.username ?? null,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      languageCode: input.languageCode ?? null,
      isBot: input.isBot ?? false,
    },
    update: {
      username: input.username ?? null,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      languageCode: input.languageCode ?? null,
    },
  });
}

export async function findUserByTelegramId(telegramUserId: bigint): Promise<User | null> {
  return prisma.user.findUnique({ where: { telegramUserId } });
}

export async function findUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}
