import { NextResponse } from "next/server";
import { AUTH_COOKIE, checkPassword, createAuthToken } from "@/lib/auth";
import { clientIp, createLoginLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = createLoginLimiter();

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (limiter.blocked(ip)) {
    return NextResponse.json(
      { error: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요." },
      { status: 429 }
    );
  }

  let password = "";
  try {
    const body = await req.json();
    password = String(body?.password ?? "");
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  if (!checkPassword(password)) {
    limiter.fail(ip);
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  limiter.reset(ip);
  const { value, maxAge } = await createAuthToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return res;
}
