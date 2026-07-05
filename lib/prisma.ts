import { PrismaClient } from "@prisma/client";

// 개발 중 HMR 로 인한 커넥션 폭증을 막기 위한 전역 싱글턴
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
