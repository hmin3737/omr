// 저장된 시험을 서버(Prisma + Vercel Postgres)에 보관한다.
// 원본 채점결과 파일은 DB에 Bytes로 저장되며, 목록에서는 메타데이터만 받고
// 파일 내용은 필요할 때(통계 재생성·다운로드) API로 따로 가져온다.

import type { StatKey } from "./stats";

export interface ExamSettings {
  cutoff: string;
  lowThreshold: string;
  electiveStart: string;
  selected: Record<StatKey, boolean>;
}

export interface ClassGroup {
  id: string;
  name: string;
  color: string;
}

/** 목록/조회용 시험 메타데이터 (파일 내용 미포함) */
export interface SavedExam {
  id: string;
  name: string;
  fileName: string;
  fileType: string;
  settings: ExamSettings;
  note: string;
  classId: string | null;
  class: ClassGroup | null;
  createdAt: number;
  updatedAt: number;
}

interface RawExam {
  id: string;
  name: string;
  fileName: string;
  fileType: string;
  settings: ExamSettings;
  note?: string;
  classId?: string | null;
  class?: ClassGroup | null;
  createdAt: string;
  updatedAt: string;
}

function normalize(e: RawExam): SavedExam {
  return {
    ...e,
    note: e.note ?? "",
    classId: e.classId ?? null,
    class: e.class ?? null,
    createdAt: new Date(e.createdAt).getTime(),
    updatedAt: new Date(e.updatedAt).getTime(),
  };
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.error === "string") return body.error;
  } catch {
    /* ignore */
  }
  return `요청 실패 (${res.status})`;
}

/** 저장된 시험 목록 (최근 수정순) */
export async function listExams(): Promise<SavedExam[]> {
  const res = await fetch("/api/exams", { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res));
  const data: RawExam[] = await res.json();
  return data.map(normalize);
}

/** 새 시험 저장 */
export async function createExam(
  name: string,
  file: File,
  settings: ExamSettings,
  note: string,
  classId: string | null
): Promise<SavedExam> {
  const form = new FormData();
  form.set("name", name);
  form.set("settings", JSON.stringify(settings));
  form.set("note", note);
  form.set("classId", classId ?? "");
  form.set("file", file);
  const res = await fetch("/api/exams", { method: "POST", body: form });
  if (!res.ok) throw new Error(await readError(res));
  return normalize(await res.json());
}

/** 기존 시험 수정 (전달한 항목만). classId는 null 전달 시 반 지정 해제. */
export async function updateExam(
  id: string,
  patch: {
    name?: string;
    settings?: ExamSettings;
    file?: File;
    note?: string;
    classId?: string | null;
  }
): Promise<SavedExam> {
  const form = new FormData();
  if (patch.name !== undefined) form.set("name", patch.name);
  if (patch.settings !== undefined) form.set("settings", JSON.stringify(patch.settings));
  if (patch.note !== undefined) form.set("note", patch.note);
  if (patch.classId !== undefined) form.set("classId", patch.classId ?? "");
  if (patch.file !== undefined) form.set("file", patch.file);
  const res = await fetch(`/api/exams/${id}`, { method: "PATCH", body: form });
  if (!res.ok) throw new Error(await readError(res));
  return normalize(await res.json());
}

/** 반 목록 */
export async function listClasses(): Promise<ClassGroup[]> {
  const res = await fetch("/api/classes", { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function createClass(name: string, color: string): Promise<ClassGroup> {
  const res = await fetch("/api/classes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, color }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function updateClass(
  id: string,
  patch: { name?: string; color?: string }
): Promise<ClassGroup> {
  const res = await fetch(`/api/classes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function deleteClass(id: string): Promise<void> {
  const res = await fetch(`/api/classes/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await readError(res));
}

/** 카테고리 팔레트 (반 색상 선택지) */
export const CLASS_COLORS = [
  "#2a78d6",
  "#1baf7a",
  "#eda100",
  "#008300",
  "#4a3aa7",
  "#e34948",
  "#e87ba4",
  "#eb6834",
];

export async function deleteExam(id: string): Promise<void> {
  const res = await fetch(`/api/exams/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await readError(res));
}

/** 원본 파일을 File 객체로 가져온다 (parseFile 등에 사용) */
export async function fetchExamFile(exam: SavedExam): Promise<File> {
  const res = await fetch(`/api/exams/${exam.id}/file`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res));
  const blob = await res.blob();
  return new File([blob], exam.fileName, { type: exam.fileType });
}

/** 원본 파일 내려받기 (서버가 attachment 로 응답) */
export function downloadExamFile(exam: SavedExam): void {
  const a = document.createElement("a");
  a.href = `/api/exams/${exam.id}/file?download=1`;
  a.download = exam.fileName || "채점결과";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
