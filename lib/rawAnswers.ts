// "학생답안"(원본 응답) 입력 모드 — raw 응답 + 정답/배점 키로 직접 채점한다.
// 채점 결과는 lib/stats.ts 의 ParsedResult 로 변환해, 기존 통계 계산(computeReport)과
// 리포트 화면(ReportView), xlsx/pdf 다운로드를 전부 그대로 재사용한다.

import * as XLSX from "xlsx";
import type { ParsedResult, StudentRecord } from "./stats";
import { readWorkbookFile } from "./workbook";

export type QuestionType = "objective" | "short";
export type Elective = 1 | 2 | 3;

export interface AnswerKeyQuestion {
  number: number;
  type: QuestionType;
  points: number;
  answer: string; // 공통 문항(number < electiveStart)의 정답
  answers: { 1: string; 2: string; 3: string }; // 선택과목 문항의 과목별 정답
}

export interface AnswerKeyPayload {
  questionCount: number;
  electiveStart: number; // 이 번호 이상은 선택과목별로 정답이 다름
  questions: AnswerKeyQuestion[];
}

export interface RawStudent {
  name: string;
  id: string; // 전화번호 등 식별자 (채점결과의 "수험번호" 칸에 그대로 대응)
  elective: Elective | null;
  rawAnswers: string[]; // 문항 순서(위치) 기준 원본 응답
}

export interface ParsedRawAnswers {
  examName: string;
  questionCount: number;
  students: RawStudent[];
}

export interface GradedQuestion {
  answered: boolean;
  correct: boolean;
  rawAnswer: string;
}

export interface GradedStudent {
  name: string;
  id: string;
  elective: Elective | null;
  score: number | null; // 응답이 전혀 없으면 null(미채점/결시 처리)
  perQuestion: GradedQuestion[];
}

export interface GradingResult {
  examName: string;
  key: AnswerKeyPayload;
  students: GradedStudent[];
}

const NAME_KEYS = ["성명", "이름", "name"];
const ID_KEYS = ["수험번호", "전화번호", "번호", "id"];
const ELECTIVE_KEYS = ["과목코드", "선택", "선택과목"];
const IGNORE_KEYS = ["생년월일", "성별", "학년", "구분", "반"];

function findCol(header: string[], keys: string[]): number {
  return header.findIndex((h) => keys.some((k) => h.toLowerCase() === k.toLowerCase()));
}

/** 표준 수능 수학 비율(공통 마지막 7문항 · 선택 마지막 2문항이 단답형)을 기본값으로 문항 유형을 채운다. */
export function defaultQuestionType(number: number, questionCount: number, electiveStart: number): QuestionType {
  const commonShortFrom = Math.max(1, electiveStart - 7);
  if (number < electiveStart) return number >= commonShortFrom ? "short" : "objective";
  const electiveShortFrom = Math.max(electiveStart, questionCount - 1);
  return number >= electiveShortFrom ? "short" : "objective";
}

// 수능 수학 공통 배점표(30문항 기준, 총 100점) — 1,2번 2점 / 3~8번 3점 / 9~15번 4점 /
// 16~19번 3점 / 20~22번 4점 / 23번 2점 / 24~27번 3점 / 28~30번 4점.
// 문항 수·선택과목 시작번호가 표준(30문항·23번)과 다르면 이 표를 적용할 수 없으므로 3점으로 기본값을 둔다.
const STANDARD_POINTS: Record<number, number> = {
  1: 2, 2: 2,
  3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3,
  9: 4, 10: 4, 11: 4, 12: 4, 13: 4, 14: 4, 15: 4,
  16: 3, 17: 3, 18: 3, 19: 3,
  20: 4, 21: 4, 22: 4,
  23: 2,
  24: 3, 25: 3, 26: 3, 27: 3,
  28: 4, 29: 4, 30: 4,
};

function defaultQuestionPoints(number: number, questionCount: number, electiveStart: number): number {
  if (questionCount === 30 && electiveStart === 23 && STANDARD_POINTS[number] !== undefined) {
    return STANDARD_POINTS[number];
  }
  return 3;
}

export function buildDefaultAnswerKey(questionCount: number, electiveStart: number): AnswerKeyPayload {
  const questions: AnswerKeyQuestion[] = [];
  for (let n = 1; n <= questionCount; n++) {
    questions.push({
      number: n,
      type: defaultQuestionType(n, questionCount, electiveStart),
      points: defaultQuestionPoints(n, questionCount, electiveStart),
      answer: "",
      answers: { 1: "", 2: "", 3: "" },
    });
  }
  return { questionCount, electiveStart, questions };
}

/** 문항 수/선택과목 시작번호를 바꿀 때, 번호가 같은 기존 입력(배점·정답)은 그대로 유지하며 다시 생성한다 */
export function resizeAnswerKey(
  prev: AnswerKeyPayload,
  questionCount: number,
  electiveStart: number
): AnswerKeyPayload {
  const byNumber = new Map(prev.questions.map((q) => [q.number, q]));
  const next = buildDefaultAnswerKey(questionCount, electiveStart);
  next.questions = next.questions.map((q) => {
    const old = byNumber.get(q.number);
    return old ? { ...q, type: old.type, points: old.points, answer: old.answer, answers: old.answers } : q;
  });
  return next;
}

/** 문항 번호 → 채점결과/문항분석 파일에 쓰는 라벨 ("단"+번호 또는 번호) */
export function questionLabel(q: AnswerKeyQuestion): string {
  return q.type === "short" ? `단${q.number}` : String(q.number);
}

export async function parseRawAnswers(file: File, examName: string): Promise<ParsedRawAnswers> {
  const wb = await readWorkbookFile(file);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  });
  if (!rows.length) throw new Error("빈 파일입니다.");

  const header = rows[0].map((c) => String(c ?? "").trim());
  const nameCol = findCol(header, NAME_KEYS);
  const idCol = findCol(header, ID_KEYS);
  const electiveCol = findCol(header, ELECTIVE_KEYS);

  const metaCols = new Set([nameCol, idCol, electiveCol]);
  header.forEach((h, i) => {
    if (IGNORE_KEYS.some((k) => h === k)) metaCols.add(i);
  });

  // 문항 컬럼: 메타 컬럼을 제외한 나머지를 "등장 순서(위치)" 그대로 문항 1..N에 매핑한다.
  // (원본 파일 헤더의 "단" 표기는 선택과목 구간을 뭉뚱그려 표시할 뿐 유형 판정에 신뢰할 수 없음)
  const questionCols: number[] = [];
  for (let c = 0; c < header.length; c++) {
    if (!metaCols.has(c)) questionCols.push(c);
  }
  if (!questionCols.length) throw new Error("문항 응답 컬럼을 찾을 수 없습니다.");

  const students: RawStudent[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c) => String(c ?? "").trim() === "")) continue;

    let elective: Elective | null = null;
    if (electiveCol >= 0) {
      const ev = Number(String(row[electiveCol] ?? "").trim());
      if (ev === 1 || ev === 2 || ev === 3) elective = ev;
    }

    students.push({
      name: nameCol >= 0 ? String(row[nameCol] ?? "").trim() : `학생${r}`,
      id: idCol >= 0 ? String(row[idCol] ?? "").trim() : "",
      elective,
      rawAnswers: questionCols.map((c) => String(row[c] ?? "").trim()),
    });
  }

  return { examName, questionCount: questionCols.length, students };
}

/** 앞자리 0 패딩(" 05" 등)을 보정해 비교할 수 있도록 정규화 */
function normalize(v: string | undefined | null): string {
  const t = String(v ?? "").trim();
  if (t === "") return "";
  return t.replace(/^0+(?=\d)/, "");
}

export function gradeRawAnswers(raw: ParsedRawAnswers, key: AnswerKeyPayload): GradingResult {
  if (raw.questionCount !== key.questionCount) {
    throw new Error(
      `학생답안 파일의 문항 수(${raw.questionCount})와 입력한 총 문항 수(${key.questionCount})가 다릅니다.`
    );
  }

  const students: GradedStudent[] = raw.students.map((s) => {
    const hasAnyAnswer = s.rawAnswers.some((a) => a.trim() !== "");
    let score = 0;
    const perQuestion: GradedQuestion[] = key.questions.map((q, i) => {
      const rawAnswer = s.rawAnswers[i] ?? "";
      const answered = rawAnswer.trim() !== "";
      let correct = false;
      if (answered) {
        const studentVal = normalize(rawAnswer);
        const keyAnswer = q.number < key.electiveStart ? q.answer : s.elective ? q.answers[s.elective] : "";
        correct = normalize(keyAnswer) !== "" && normalize(keyAnswer) === studentVal;
      }
      if (correct) score += q.points;
      return { answered, correct, rawAnswer };
    });

    return {
      name: s.name,
      id: s.id,
      elective: s.elective,
      score: hasAnyAnswer ? score : null,
      perQuestion,
    };
  });

  return { examName: raw.examName, key, students };
}

/** 기존 computeReport/ReportView/xlsx·pdf 다운로드를 그대로 쓰기 위한 유일한 변환 지점 */
export function gradedToParsedResult(result: GradingResult): ParsedResult {
  const questionLabels = result.key.questions.map((q) => questionLabel(q));
  const students: StudentRecord[] = result.students.map((s) => ({
    name: s.name || "학생",
    id: s.id,
    score: s.score,
    elective: s.elective,
    correct: s.perQuestion.map((p) => p.correct),
    answered: s.perQuestion.map((p) => p.answered),
  }));
  return { examName: result.examName, questionLabels, students };
}
