-- CreateTable (기존 DB와 공유될 수 있어 IF NOT EXISTS 로 idempotent 하게 생성)
CREATE TABLE IF NOT EXISTS "Exam" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileData" BYTEA NOT NULL,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Exam_updatedAt_idx" ON "Exam"("updatedAt");

-- AddColumn: 시험 메모 (기존 테이블에도 idempotent 하게 추가)
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "note" TEXT NOT NULL DEFAULT '';
