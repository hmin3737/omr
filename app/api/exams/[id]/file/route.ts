import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 원본 파일 내용 반환. ?download=1 이면 첨부(다운로드), 아니면 인라인(통계 재생성용 fetch).
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const exam = await prisma.exam.findUnique({
    where: { id: params.id },
    select: { fileData: true, fileName: true, fileType: true },
  });
  if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });

  const download = new URL(req.url).searchParams.get("download") === "1";
  const disposition = download ? "attachment" : "inline";
  const encodedName = encodeURIComponent(exam.fileName || "채점결과");

  return new NextResponse(Buffer.from(exam.fileData), {
    headers: {
      "Content-Type": exam.fileType || "application/octet-stream",
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "no-store",
    },
  });
}
