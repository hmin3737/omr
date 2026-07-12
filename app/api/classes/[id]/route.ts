import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { name, color } = await req.json();
    const data: Prisma.ClassGroupUpdateInput = {};
    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) return NextResponse.json({ error: "반 이름은 비울 수 없습니다." }, { status: 400 });
      data.name = trimmed;
    }
    if (color !== undefined) data.color = String(color);
    const updated = await prisma.classGroup.update({
      where: { id: params.id },
      data,
      select: { id: true, name: true, color: true },
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")
      return NextResponse.json({ error: "반을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "반 수정 실패" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    // 이 반에 속한 시험은 반 지정만 해제(삭제하지 않음)
    await prisma.exam.updateMany({ where: { classId: params.id }, data: { classId: null } });
    await prisma.classGroup.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")
      return NextResponse.json({ error: "반을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "반 삭제 실패" },
      { status: 500 }
    );
  }
}
