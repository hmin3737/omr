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

-- Eat: 배달 맛집 데이터베이스
CREATE TABLE IF NOT EXISTS "Restaurant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baeminUrl" TEXT NOT NULL DEFAULT '',
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "meals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "openTime" TEXT NOT NULL DEFAULT '',
    "closeTime" TEXT NOT NULL DEFAULT '',
    "breakStart" TEXT NOT NULL DEFAULT '',
    "breakEnd" TEXT NOT NULL DEFAULT '',
    "closedDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "meetPayment" BOOLEAN NOT NULL DEFAULT true,
    "storeDelivery" BOOLEAN NOT NULL DEFAULT true,
    "pricePerPerson" INTEGER,
    "minOrder" INTEGER,
    "menus" JSONB NOT NULL DEFAULT '[]',
    "memo" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "lastOrderedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Restaurant_pkey" PRIMARY KEY ("id")
);

-- Eat 음식 종류
CREATE TABLE IF NOT EXISTS "FoodCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoodCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FoodCategory_name_key" ON "FoodCategory"("name");

-- 기본 종류는 테이블이 비어 있을 때만 채운다 (사용자가 이름을 바꾼 뒤 빌드해도 되살아나지 않도록)
INSERT INTO "FoodCategory" ("id", "name", "sortOrder")
SELECT 'default-' || d.ord, d.name, d.ord
FROM (VALUES
    ('한식', 1), ('국밥·찌개', 2), ('중식', 3), ('일식·돈까스', 4), ('분식', 5),
    ('도시락·덮밥', 6), ('양식', 7), ('아시안', 8), ('치킨', 9), ('피자', 10),
    ('버거·샌드위치', 11), ('샐러드·건강식', 12), ('기타', 13)
) AS d(name, ord)
WHERE NOT EXISTS (SELECT 1 FROM "FoodCategory");
