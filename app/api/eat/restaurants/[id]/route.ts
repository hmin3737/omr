import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isEatAdmin } from "@/lib/eat-admin";
import { sanitizeRestaurantInput } from "@/lib/eat";
import { keepKnownCategories } from "@/lib/eat-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 수정: 누구나 가능. 추천 여부 변경만 실장 전용
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const input = sanitizeRestaurantInput(await req.json());
    if (!input) return NextResponse.json({ error: "가게 이름이 필요합니다." }, { status: 400 });

    const current = await prisma.restaurant.findUnique({
      where: { id: params.id },
      select: { recommended: true },
    });
    if (!current) return NextResponse.json({ error: "가게를 찾을 수 없습니다." }, { status: 404 });

    if (!(await isEatAdmin())) input.recommended = current.recommended;
    await keepKnownCategories(input);

    const updated = await prisma.restaurant.update({
      where: { id: params.id },
      data: { ...input, menus: input.menus.map(({ name, price }) => ({ name, price })) },
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")
      return NextResponse.json({ error: "가게를 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "수정 실패" },
      { status: 500 }
    );
  }
}

// 삭제: 누구나 가능
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await prisma.restaurant.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")
      return NextResponse.json({ error: "가게를 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "삭제 실패" },
      { status: 500 }
    );
  }
}
