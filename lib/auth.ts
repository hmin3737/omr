// 사이트 전체 비밀번호 게이트.
// "황제침향원"과 그 영문 자판 표기 "ghkdwpclagiddnjs"는 같은 비밀번호의 두 표기로 보고 둘 다 허용한다.
// SITE_PASSWORD 환경변수(콤마 구분)로 후보를 추가/교체할 수 있다.

export const AUTH_COOKIE = "omr_auth";
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30일

const DEFAULT_CANDIDATES = ["황제침향원", "ghkdwpclagiddnjs"];

function passwordCandidates(): string[] {
  const extra = (process.env.SITE_PASSWORD ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return extra.length ? extra : DEFAULT_CANDIDATES;
}

export function checkPassword(input: string): boolean {
  const v = input.trim();
  if (!v) return false;
  return passwordCandidates().some((c) => c === v);
}

// SESSION_SECRET이 없으면 비밀번호 후보들로부터 파생시켜, 별도 설정 없이도 바로 동작하게 한다.
function sessionSecret(): string {
  return process.env.SESSION_SECRET || `omr-session-salt::${passwordCandidates().join("|")}`;
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Buffer.from(sig).toString("hex");
}

/** 로그인 성공 시 쿠키에 담을 서명된 토큰(만료시각 포함) 생성 */
export async function createAuthToken(): Promise<{ value: string; maxAge: number }> {
  const expires = Date.now() + COOKIE_MAX_AGE_SEC * 1000;
  const payload = String(expires);
  const sig = await hmac(payload);
  return { value: `${payload}.${sig}`, maxAge: COOKIE_MAX_AGE_SEC };
}

/** 요청에 담긴 토큰이 유효한지(서명 일치 + 만료 전) 검사 */
export async function verifyAuthToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expires = Number(payload);
  if (!Number.isFinite(expires) || Date.now() > expires) return false;
  const expected = await hmac(payload);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
