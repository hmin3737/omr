import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const META_SELECT = {
  id: true,
  name: true,
  fileName: true,
  fileType: true,
  settings: true,
  createdAt: true,
  updatedAt: true,
} as const;

// 이름 / 설정 / 원본 파일 부분 수정 (multipart/form-data)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const form = await req.formData();
    const data: Prisma.ExamUpdateInput = {};

    const name = form.get("name");
    if (name !== null) {
      const trimmed = String(name).trim();
      if (!trimmed) return NextResponse.json({ error: "시험명은 비울 수 없습니다." }, { status: 400 });
      data.name = trimmed;
    }

    const settingsRaw = form.get("settings");
    if (settingsRaw !== null) data.settings = JSON.parse(String(settingsRaw));

    const file = form.get("file");
    if (file instanceof File) {
      data.fileName = file.name;
      data.fileType = file.type;
      data.fileData = Buffer.from(await file.arrayBuffer());
    }

    const updated = await prisma.exam.update({
      where: { id: params.id },
      data,
      select: META_SELECT,
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")
      return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "수정 실패" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await prisma.exam.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")
      return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "삭제 실패" },
      { status: 500 }
    );
  }
}
