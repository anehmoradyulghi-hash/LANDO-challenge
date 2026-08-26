import { prisma } from "@/database/prisma";
import { ChannelAccessStatus } from "@prisma/client";

export async function listChannelsForOwner(ownerId: string) {
  return prisma.channel.findMany({
    where: { ownerId, isDeleted: false },
    orderBy: { createdAt: "desc" },
  });
}

export async function countChannelsForOwner(ownerId: string): Promise<number> {
  return prisma.channel.count({ where: { ownerId, isDeleted: false } });
}

export async function findChannelByOwnerAndChatId(ownerId: string, telegramChatId: bigint) {
  return prisma.channel.findUnique({
    where: { ownerId_telegramChatId: { ownerId, telegramChatId } },
  });
}

export async function findChannelById(id: string) {
  return prisma.channel.findUnique({ where: { id } });
}

export async function createOrRestoreChannel(params: {
  ownerId: string;
  telegramChatId: bigint;
  username: string | null;
  title: string | null;
  accessStatus: ChannelAccessStatus;
}) {
  const existing = await findChannelByOwnerAndChatId(params.ownerId, params.telegramChatId);
  if (existing) {
    return prisma.channel.update({
      where: { id: existing.id },
      data: {
        username: params.username,
        title: params.title,
        accessStatus: params.accessStatus,
        isDeleted: false,
        lastCheckedAt: new Date(),
      },
    });
  }
  return prisma.channel.create({
    data: {
      ownerId: params.ownerId,
      telegramChatId: params.telegramChatId,
      username: params.username,
      title: params.title,
      accessStatus: params.accessStatus,
      lastCheckedAt: new Date(),
    },
  });
}

export async function updateChannelAccessStatus(id: string, accessStatus: ChannelAccessStatus) {
  return prisma.channel.update({
    where: { id },
    data: { accessStatus, lastCheckedAt: new Date() },
  });
}

/** Soft delete only - historical challenge links must survive (section 7). */
export async function softDeleteChannel(id: string) {
  return prisma.channel.update({ where: { id }, data: { isDeleted: true } });
}
