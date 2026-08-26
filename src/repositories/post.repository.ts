import { prisma } from "@/database/prisma";
import { PostStatus } from "@prisma/client";

export async function upsertPendingPost(challengeId: string, channelId: string) {
  return prisma.challengePost.upsert({
    where: { challengeId_channelId: { challengeId, channelId } },
    create: { challengeId, channelId, status: PostStatus.PENDING },
    update: { status: PostStatus.PENDING, lastError: null },
  });
}

export async function markPostPublished(id: string, telegramMessageId: bigint) {
  return prisma.challengePost.update({
    where: { id },
    data: { status: PostStatus.PUBLISHED, telegramMessageId, lastError: null },
  });
}

export async function markPostFailed(id: string, error: string) {
  return prisma.challengePost.update({
    where: { id },
    data: { status: PostStatus.FAILED, lastError: error },
  });
}

export async function listPostsForChallenge(challengeId: string) {
  return prisma.challengePost.findMany({
    where: { challengeId },
    include: { channel: true },
  });
}

export async function listFailedPosts(challengeId: string) {
  return prisma.challengePost.findMany({
    where: { challengeId, status: PostStatus.FAILED },
    include: { channel: true },
  });
}

export async function updateParticipantCountShown(id: string, count: number) {
  return prisma.challengePost.update({
    where: { id },
    data: { lastParticipantCountShown: count, lastEditedAt: new Date() },
  });
}

/** Posts whose displayed count is stale enough to justify a Telegram editMessageText call (section 51). */
export async function listPublishedPosts(challengeId: string) {
  return prisma.challengePost.findMany({
    where: { challengeId, status: PostStatus.PUBLISHED },
    include: { channel: true },
  });
}
