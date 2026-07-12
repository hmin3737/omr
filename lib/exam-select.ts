import { Prisma } from "@prisma/client";

// 시험 목록/조회 공통 select (파일 내용 제외 + 반 정보 포함)
export const EXAM_META_SELECT = {
  id: true,
  name: true,
  fileName: true,
  fileType: true,
  settings: true,
  note: true,
  classId: true,
  class: { select: { id: true, name: true, color: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ExamSelect;
