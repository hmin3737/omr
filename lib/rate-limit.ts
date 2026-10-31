// 간단한 인메모리 로그인 레이트리밋 (서버리스 인스턴스별로만 유효 — 최소한의 브루트포스 억제 목적)

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "unknown";
}

export function createLoginLimiter() {
  const attempts = new Map<string, { count: number; resetAt: number }>();
  return {
    /** 시도 한도를 넘겼으면 true */
    blocked(ip: string): boolean {
      const entry = attempts.get(ip);
      return !!entry && entry.resetAt > Date.now() && entry.count >= MAX_ATTEMPTS;
    },
    fail(ip: string) {
      const now = Date.now();
      const entry = attempts.get(ip);
      attempts.set(
        ip,
        !entry || entry.resetAt <= now
          ? { count: 1, resetAt: now + WINDOW_MS }
          : { count: entry.count + 1, resetAt: entry.resetAt }
      );
    },
    reset(ip: string) {
      attempts.delete(ip);
    },
  };
}
