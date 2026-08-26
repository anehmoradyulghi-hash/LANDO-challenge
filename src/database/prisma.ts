import { PrismaClient } from "@prisma/client";
import { env } from "@/config/env";

// Single shared PrismaClient instance across the whole process.
export const prisma = new PrismaClient({
  log: env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["warn", "error"],
});

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
