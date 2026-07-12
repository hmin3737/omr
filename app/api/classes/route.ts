import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const classes = await prisma.classGroup.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, color: true },
  });
  return NextResponse.json(classes);
}

export async function POST(req: Request) {
  try {
    const { name, color } = await req.json();
    const trimmed = String(name ?? "").trim();
    if (!trimmed) return NextResponse.json({ error: "반 이름이 필요합니다." }, { status: 400 });
    const created = await prisma.classGroup.create({
      data: { name: trimmed, color: String(color || "#2a78d6") },
      select: { id: true, name: true, color: true },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "반 생성 실패" },
      { status: 500 }
    );
  }
}
