import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15MB
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  let body: {
    to?: string;
    subject?: string;
    filename?: string;
    contentBase64?: string;
    mimeType?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const to = String(body.to ?? "").trim();
  const filename = String(body.filename ?? "첨부파일");
  const contentBase64 = String(body.contentBase64 ?? "");
  const mimeType = String(body.mimeType ?? "application/octet-stream");
  const subject = String(body.subject ?? filename);

  if (!EMAIL_RE.test(to)) {
    return NextResponse.json({ error: "받는 사람 이메일 주소가 올바르지 않습니다." }, { status: 400 });
  }
  if (!contentBase64) {
    return NextResponse.json({ error: "첨부할 파일 내용이 없습니다." }, { status: 400 });
  }
  const approxBytes = (contentBase64.length * 3) / 4;
  if (approxBytes > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json({ error: "첨부파일이 너무 큽니다 (최대 15MB)." }, { status: 413 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return NextResponse.json(
      {
        error:
          "이메일 발송이 아직 설정되지 않았습니다. Resend에서 API 키를 발급받아 RESEND_API_KEY, EMAIL_FROM 환경변수를 설정하세요.",
      },
      { status: 500 }
    );
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text: `${filename} 파일을 첨부합니다.`,
        attachments: [{ filename, content: contentBase64, content_type: mimeType }],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `이메일 발송에 실패했습니다. (${res.status}) ${detail}`.trim() },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "이메일 발송 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
