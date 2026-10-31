import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "여기서 주문함" 기록 — 랜덤 뽑기에서 최근 주문한 가게가 덜 나오게 하는 데 쓴다
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const updated = await prisma.restaurant.update({
      where: { id: params.id },
      data: { lastOrderedAt: new Date() },
      select: { lastOrderedAt: true },
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")
      return NextResponse.json({ error: "가게를 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ error: "처리 실패" }, { status: 500 });
  }
}
