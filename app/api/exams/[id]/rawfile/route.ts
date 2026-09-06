import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 학생답안(raw) 모드로 저장된 시험의 원본 응답 파일. ?download=1 이면 첨부, 아니면 인라인(재로딩용).
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const exam = await prisma.exam.findUnique({
    where: { id: params.id },
    select: { rawFileData: true, rawFileName: true, rawFileType: true },
  });
  if (!exam || !exam.rawFileData)
    return NextResponse.json({ error: "학생답안 원본을 찾을 수 없습니다." }, { status: 404 });

  const download = new URL(req.url).searchParams.get("download") === "1";
  const disposition = download ? "attachment" : "inline";
  const encodedName = encodeURIComponent(exam.rawFileName || "학생답안");

  return new NextResponse(Buffer.from(exam.rawFileData), {
    headers: {
      "Content-Type": exam.rawFileType || "application/octet-stream",
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "no-store",
    },
  });
}
