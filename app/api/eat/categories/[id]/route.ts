import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isEatAdmin } from "@/lib/eat-admin";
import { sanitizeCategoryName } from "@/lib/eat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function knownError(e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2025") return NextResponse.json({ error: "종류를 찾을 수 없습니다." }, { status: 404 });
    if (e.code === "P2002") return NextResponse.json({ error: "이미 있는 종류입니다." }, { status: 409 });
  }
  return null;
}

// 이름 변경: 누구나 가능. 이 종류가 붙은 가게들의 종류 이름도 함께 바꾼다.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const name = sanitizeCategoryName(body?.name);
    if (!name) return NextResponse.json({ error: "종류 이름이 필요합니다." }, { status: 400 });

    const current = await prisma.foodCategory.findUnique({ where: { id: params.id } });
    if (!current) return NextResponse.json({ error: "종류를 찾을 수 없습니다." }, { status: 404 });
    if (current.name === name) return NextResponse.json({ id: current.id, name });

    const [updated] = await prisma.$transaction([
      prisma.foodCategory.update({
        where: { id: params.id },
        data: { name },
        select: { id: true, name: true },
      }),
      prisma.$executeRaw`UPDATE "Restaurant" SET "categories" = array_replace("categories", ${current.name}, ${name}) WHERE ${current.name} = ANY("categories")`,
    ]);
    return NextResponse.json(updated);
  } catch (e) {
    return (
      knownError(e) ??
      NextResponse.json({ error: e instanceof Error ? e.message : "수정 실패" }, { status: 500 })
    );
  }
}

// 삭제: 실장만. 가게들에서도 이 종류를 뺀다.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await isEatAdmin()))
    return NextResponse.json({ error: "종류 삭제는 실장만 할 수 있습니다." }, { status: 403 });
  try {
    const current = await prisma.foodCategory.findUnique({ where: { id: params.id } });
    if (!current) return NextResponse.json({ error: "종류를 찾을 수 없습니다." }, { status: 404 });
    await prisma.$transaction([
      prisma.foodCategory.delete({ where: { id: params.id } }),
      prisma.$executeRaw`UPDATE "Restaurant" SET "categories" = array_remove("categories", ${current.name}) WHERE ${current.name} = ANY("categories")`,
    ]);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return (
      knownError(e) ??
      NextResponse.json({ error: e instanceof Error ? e.message : "삭제 실패" }, { status: 500 })
    );
  }
}
