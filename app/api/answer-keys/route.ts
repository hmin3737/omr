import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 목록: payload(문항 배점/정답 전체)는 제외하고 이름만 반환 (다른 분반에서 검색용)
export async function GET() {
  const templates = await prisma.answerKeyTemplate.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, updatedAt: true },
  });
  return NextResponse.json(templates);
}

// 이름 기준 upsert: 같은 이름이 있으면 갱신, 없으면 새로 생성
export async function PUT(req: Request) {
  try {
    const { name, payload } = await req.json();
    const trimmed = String(name ?? "").trim();
    if (!trimmed) return NextResponse.json({ error: "템플릿 이름이 필요합니다." }, { status: 400 });
    if (!payload) return NextResponse.json({ error: "정답 데이터가 필요합니다." }, { status: 400 });

    const saved = await prisma.answerKeyTemplate.upsert({
      where: { name: trimmed },
      update: { payload },
      create: { name: trimmed, payload },
      select: { id: true, name: true, updatedAt: true },
    });
    return NextResponse.json(saved);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "저장 실패" },
      { status: 500 }
    );
  }
}
