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

-- 반(ClassGroup) 테이블 및 Exam.classId 컬럼
CREATE TABLE IF NOT EXISTS "ClassGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#2a78d6',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassGroup_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "classId" TEXT;

-- 학생답안(raw) 입력 모드: 채점에 사용한 원본 답안/정답 스냅샷 보관
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "sourceType" TEXT NOT NULL DEFAULT 'graded';
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "rawFileName" TEXT;
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "rawFileType" TEXT;
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "rawFileData" BYTEA;
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "answerKey" JSONB;

-- 정답 템플릿(문항별 배점·정답 세트) 저장 및 분반 간 재사용
CREATE TABLE IF NOT EXISTS "AnswerKeyTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnswerKeyTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AnswerKeyTemplate_name_key" ON "AnswerKeyTemplate"("name");
