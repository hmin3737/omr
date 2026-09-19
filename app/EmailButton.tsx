"use client";

import { useState } from "react";

interface Attachment {
  base64: string;
  filename: string;
  mimeType: string;
}

export default function EmailButton({
  getAttachment,
  label = "이메일로 보내기",
  disabled = false,
}: {
  getAttachment: () => Attachment | Attachment[] | Promise<Attachment | Attachment[]>;
  label?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    const to = window.prompt("보낼 이메일 주소를 입력하세요.");
    if (!to) return;
    setBusy(true);
    try {
      const result = await getAttachment();
      const atts = Array.isArray(result) ? result : [result];
      if (atts.length === 0) {
        window.alert("보낼 파일을 하나 이상 선택하세요.");
        return;
      }
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: to.trim(),
          subject: atts[0].filename,
          attachments: atts.map((a) => ({
            filename: a.filename,
            contentBase64: a.base64,
            mimeType: a.mimeType,
          })),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        window.alert(body?.error ?? "이메일 발송에 실패했습니다.");
        return;
      }
      window.alert(`${to}(으)로 보냈습니다.`);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "이메일 발송 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="btn-mini" onClick={handleClick} disabled={busy || disabled}>
      {busy ? "보내는 중..." : label}
    </button>
  );
}
