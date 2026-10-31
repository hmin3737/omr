import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sanitizeCategoryName } from "@/lib/eat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const categories = await prisma.foodCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true },
  });
  return NextResponse.json(categories);
}

// 추가: 누구나 가능. 맨 뒤에 붙인다.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = sanitizeCategoryName(body?.name);
    if (!name) return NextResponse.json({ error: "종류 이름이 필요합니다." }, { status: 400 });

    const last = await prisma.foodCategory.aggregate({ _max: { sortOrder: true } });
    const created = await prisma.foodCategory.create({
      data: { name, sortOrder: (last._max.sortOrder ?? 0) + 1 },
      select: { id: true, name: true },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json({ error: "이미 있는 종류입니다." }, { status: 409 });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "추가 실패" },
      { status: 500 }
    );
  }
}
