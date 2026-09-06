import { NextResponse } from "next/server";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB

export function tooLargeResponse() {
  return NextResponse.json({ error: "파일이 너무 큽니다 (최대 15MB)." }, { status: 413 });
}
