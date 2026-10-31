import { NextResponse } from "next/server";
import { EAT_ADMIN_COOKIE, adminPassword, createAdminToken, isEatAdmin } from "@/lib/eat-admin";
import { clientIp, createLoginLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = createLoginLimiter();

export async function GET() {
  return NextResponse.json({ admin: await isEatAdmin() });
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (limiter.blocked(ip)) {
    return NextResponse.json(
      { error: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요." },
      { status: 429 }
    );
  }
  const expected = adminPassword();
  if (!expected) {
    return NextResponse.json(
      { error: "관리자 비밀번호가 설정되지 않았습니다. EAT_ADMIN_PASSWORD 환경변수를 설정하세요." },
      { status: 500 }
    );
  }

  let password = "";
  try {
    const body = await req.json();
    password = String(body?.password ?? "").trim();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (password !== expected) {
    limiter.fail(ip);
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  limiter.reset(ip);
  const { value, maxAge } = await createAdminToken();
  const res = NextResponse.json({ admin: true });
  res.cookies.set(EAT_ADMIN_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ admin: false });
  res.cookies.set(EAT_ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
