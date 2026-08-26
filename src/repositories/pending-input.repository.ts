import { prisma } from "@/database/prisma";

const TTL_MS = 30 * 60 * 1000; // 30 minutes is plenty for a single text reply

export async function setPendingInput(userId: string, purpose: string, payload?: unknown) {
  const expiresAt = new Date(Date.now() + TTL_MS);
  return prisma.pendingTextInput.upsert({
    where: { userId },
    create: { userId, purpose, payload: payload as any, expiresAt },
    update: { purpose, payload: payload as any, expiresAt },
  });
}

export async function getPendingInput(userId: string) {
  const pending = await prisma.pendingTextInput.findUnique({ where: { userId } });
  if (!pending) return null;
  if (pending.expiresAt < new Date()) {
    await prisma.pendingTextInput.delete({ where: { userId } });
    return null;
  }
  return pending;
}

export async function clearPendingInput(userId: string) {
  await prisma.pendingTextInput.deleteMany({ where: { userId } });
}
