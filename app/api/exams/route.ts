import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 목록: 파일 내용(fileData)은 제외하고 메타데이터만 반환 (최근 수정순)
export async function GET() {
  const exams = await prisma.exam.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      fileName: true,
      fileType: true,
      settings: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return NextResponse.json(exams);
}

// 새 시험 저장 (multipart/form-data: name, settings(JSON), file)
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const name = String(form.get("name") ?? "").trim();
    const settingsRaw = String(form.get("settings") ?? "");
    const file = form.get("file");

    if (!name) return NextResponse.json({ error: "시험명이 필요합니다." }, { status: 400 });
    if (!(file instanceof File))
      return NextResponse.json({ error: "파일이 필요합니다." }, { status: 400 });

    const settings = settingsRaw ? JSON.parse(settingsRaw) : {};
    const buf = Buffer.from(await file.arrayBuffer());

    const created = await prisma.exam.create({
      data: {
        name,
        fileName: file.name,
        fileType: file.type,
        fileData: buf,
        settings,
      },
      select: {
        id: true,
        name: true,
        fileName: true,
        fileType: true,
        settings: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "저장 실패" },
      { status: 500 }
    );
  }
}
