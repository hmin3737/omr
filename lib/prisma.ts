import { PrismaClient } from "@prisma/client";

// 개발 중 HMR 로 인한 커넥션 폭증을 막기 위한 전역 싱글턴
// 서버리스에서는 인스턴스마다 풀이 생기므로 인스턴스당 커넥션을 1개로 제한한다.
function datasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || /[?&]connection_limit=/.test(url)) return url;
  return url + (url.includes("?") ? "&" : "?") + "connection_limit=1";
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: datasourceUrl(),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

globalForPrisma.prisma = prisma;
