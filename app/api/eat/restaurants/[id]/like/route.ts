import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 좋아요 +1 (중복 방지는 클라이언트에서 브라우저별로만 처리)
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const updated = await prisma.restaurant.update({
      where: { id: params.id },
      data: { likes: { increment: 1 } },
      select: { likes: true },
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")
      return NextResponse.json({ error: "가게를 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ error: "처리 실패" }, { status: 500 });
  }
}
