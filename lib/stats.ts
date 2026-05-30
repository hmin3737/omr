// OMR 채점결과 파싱 및 통계 산출 로직
//
// 수능(대학수학능력시험) 준용 계산식 (국어·수학 기준: 평균 100, 표준편차 20)
//   - 표준점수  = (원점수 - 평균) / 표준편차 × 20 + 100
//   - 백분위    = (본인보다 낮은 점수 인원 + 동점자 수 ÷ 2) / 전체 인원 × 100
//   - 등급      = 상위 누적비율 컷(4/11/23/40/60/77/89/96/100%) 기준, 동점자는 상위 등급으로 처리
//
// 수학 시험의 선택과목: 1=확률과 통계, 2=미적분, 3=기하.
// 미적분 외 응시자가 한 명이라도 있으면 선택과목별로 통계를 분리(break down)한다.
//
// 모든 통계는 "점수가 산출된(미응시·미채점 제외) 응시자"만을 대상으로 한다.
// 허수 제거 시에는 기준 점수 이하의 응시자를 제거한 뒤 계산한다.
// 소수점은 소수 셋째 자리에서 반올림(=소수 둘째 자리까지)한다.

export const ELECTIVE_SHORT: Record<number, string> = { 1: "확통", 2: "미적", 3: "기하" };
export const ELECTIVE_LONG: Record<number, string> = {
  1: "확률과 통계",
  2: "미적분",
  3: "기하",
};

export interface ParsedResult {
  examName: string;
  /** 컬럼 인덱스 기준 문항 헤더(예: "1", "단16", ...) */
  questionLabels: string[];
  /** 학생별 레코드 */
  students: StudentRecord[];
}

export interface StudentRecord {
  name: string;
  id: string;
  score: number | null; // 점수 미산출이면 null
  elective: number | null; // 1=확통, 2=미적, 3=기하 (없으면 null)
  /** 문항별 정답 여부. 'O' 이면 정답, 그 외(오답/공백)는 false */
  correct: boolean[];
  /** 문항별 응답 여부. 공백이 아니면 true (선택과목 적용 여부 판별용) */
  answered: boolean[];
}

export interface QuestionAccuracy {
  label: string;
  correctRate: number; // 전체(적용 그룹 합산) 정답률 %
  correctCount: number;
  total: number;
  /** break down 시 선택과목별 정답률(%). 해당 과목 문제가 아니면 null */
  perElective?: Record<number, number | null>;
  /** 선택과목 전용 문제일 때 해당 과목 표기(예: "미적"). 공통 문제면 null */
  electiveTag?: string | null;
}

export interface ConversionRow {
  rawScore: number;
  standardScore: number;
  percentile: number;
  grade: number;
}

export interface ElectiveStat {
  elective: number;
  short: string;
  count: number;
  mean: number;
  stdev: number;
  perfectCount: number;
  maxScore: number;
  maxScoreCount: number;
}

export type StatKey =
  | "count"
  | "mean"
  | "stdev"
  | "perfect"
  | "top30"
  | "percentile"
  | "standardScore"
  | "grade";

export interface StatOptions {
  cutoff: number | null; // 허수 제거 기준(이 점수 이하 제거). null이면 미적용
  selected: Record<StatKey, boolean>;
  lowAccuracyThreshold: number; // 정답률(%) 이 값 미만이면 "정답률 낮은 문제"
}

export interface StatReport {
  examName: string;
  count: number;
  removedCount: number; // 허수 제거된 인원
  ungradedCount: number; // 점수 미산출 인원
  mean: number;
  stdev: number;
  perfectCount: number;
  maxScore: number;
  maxScoreCount: number;
  top30Mean: number;
  top30N: number;
  conversion: ConversionRow[];
  lowAccuracy: QuestionAccuracy[];
  allAccuracy: QuestionAccuracy[];
  // 선택과목 break down
  breakdown: boolean;
  electivesPresent: number[]; // 오름차순(1,2,3)
  electiveStats: ElectiveStat[];
  options: StatOptions;
}

/** 소수 셋째 자리에서 반올림 (소수 둘째 자리까지) */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const GRADE_CUTS = [4, 11, 23, 40, 60, 77, 89, 96, 100];

function gradeForCumRatio(cumRatioTopPercent: number): number {
  for (let g = 0; g < GRADE_CUTS.length; g++) {
    if (cumRatioTopPercent <= GRADE_CUTS[g]) return g + 1;
  }
  return 9;
}

interface BasicStats {
  count: number;
  mean: number;
  stdev: number;
  perfectCount: number;
  maxScore: number;
  maxScoreCount: number;
}

function basicStats(scores: number[]): BasicStats {
  const count = scores.length;
  const mean = count ? scores.reduce((a, b) => a + b, 0) / count : 0;
  const variance = count
    ? scores.reduce((a, b) => a + (b - mean) ** 2, 0) / count // 모표준편차
    : 0;
  const stdev = Math.sqrt(variance);
  const perfectCount = scores.filter((s) => s === 100).length;
  const maxScore = count ? Math.max(...scores) : 0;
  const maxScoreCount = scores.filter((s) => s === maxScore).length;
  return { count, mean, stdev, perfectCount, maxScore, maxScoreCount };
}

export function computeReport(parsed: ParsedResult, options: StatOptions): StatReport {
  const graded = parsed.students.filter((s) => s.score !== null);
  const ungradedCount = parsed.students.length - graded.length;

  let kept = graded;
  let removedCount = 0;
  if (options.cutoff !== null) {
    kept = graded.filter((s) => (s.score as number) > (options.cutoff as number));
    removedCount = graded.length - kept.length;
  }

  const scores = kept.map((s) => s.score as number);
  const overall = basicStats(scores);
  const count = overall.count;

  // 선택과목 break down 여부: 미적분(2) 외 응시자가 한 명이라도 있으면 적용
  const electivesPresent = Array.from(
    new Set(kept.map((s) => s.elective).filter((e): e is number => e === 1 || e === 2 || e === 3))
  ).sort((a, b) => a - b);
  const breakdown = electivesPresent.some((e) => e !== 2);

  const electiveStats: ElectiveStat[] = breakdown
    ? electivesPresent.map((e) => {
        const b = basicStats(
          kept.filter((s) => s.elective === e).map((s) => s.score as number)
        );
        return {
          elective: e,
          short: ELECTIVE_SHORT[e],
          count: b.count,
          mean: round2(b.mean),
          stdev: round2(b.stdev),
          perfectCount: b.perfectCount,
          maxScore: round2(b.maxScore),
          maxScoreCount: b.maxScoreCount,
        };
      })
    : [];

  // 상위 30% 평균: 점수 내림차순 정렬 후 상위 30% 인원(반올림)
  const sortedDesc = [...scores].sort((a, b) => b - a);
  const top30N = Math.round(count * 0.3);
  const top30Slice = sortedDesc.slice(0, top30N);
  const top30Mean = top30N ? top30Slice.reduce((a, b) => a + b, 0) / top30N : 0;

  // 환산표: 시험에 존재하는 각 원점수 → 표준점수/백분위/등급
  const conversion = buildConversion(scores, overall.mean, overall.stdev);

  // 문항별 정답률 (kept 학생 기준)
  const allAccuracy = computeAccuracy(kept, parsed.questionLabels, electivesPresent, breakdown);
  const lowAccuracy = allAccuracy
    .filter((q) => q.correctRate < options.lowAccuracyThreshold)
    .sort((a, b) => a.correctRate - b.correctRate);

  return {
    examName: parsed.examName,
    count,
    removedCount,
    ungradedCount,
    mean: round2(overall.mean),
    stdev: round2(overall.stdev),
    perfectCount: overall.perfectCount,
    maxScore: round2(overall.maxScore),
    maxScoreCount: overall.maxScoreCount,
    top30Mean: round2(top30Mean),
    top30N,
    conversion,
    lowAccuracy,
    allAccuracy,
    breakdown,
    electivesPresent,
    electiveStats,
    options,
  };
}

function buildConversion(scores: number[], mean: number, stdev: number): ConversionRow[] {
  const n = scores.length;
  if (!n) return [];
  const distinct = Array.from(new Set(scores)).sort((a, b) => b - a);

  return distinct.map((raw) => {
    const lower = scores.filter((s) => s < raw).length;
    const equal = scores.filter((s) => s === raw).length;
    const higherOrEqual = scores.filter((s) => s >= raw).length;

    const percentile = ((lower + equal / 2) / n) * 100;
    const standardScore = stdev > 0 ? ((raw - mean) / stdev) * 20 + 100 : 100;
    const cumTop = (higherOrEqual / n) * 100; // 동점자 포함 → 상위 등급 부여
    const grade = gradeForCumRatio(cumTop);

    return {
      rawScore: round2(raw),
      standardScore: round2(standardScore),
      percentile: round2(percentile),
      grade,
    };
  });
}

function computeAccuracy(
  students: StudentRecord[],
  labels: string[],
  electivesPresent: number[],
  breakdown: boolean
): QuestionAccuracy[] {
  if (!breakdown) {
    const total = students.length;
    return labels.map((label, i) => {
      const correctCount = students.filter((s) => s.correct[i]).length;
      return {
        label,
        correctRate: round2(total ? (correctCount / total) * 100 : 0),
        correctCount,
        total,
      };
    });
  }

  const groups = electivesPresent.map((e) => ({
    e,
    members: students.filter((s) => s.elective === e),
  }));

  return labels.map((label, i) => {
    const perElective: Record<number, number | null> = {};
    let correctAll = 0;
    let totalAll = 0;
    const applicable: number[] = [];

    for (const { e, members } of groups) {
      const responded = members.filter((s) => s.answered[i]).length;
      if (responded === 0) {
        // 이 선택과목 응시자는 아무도 응답하지 않음 → 해당 과목 문제가 아님
        perElective[e] = null;
        continue;
      }
      const c = members.filter((s) => s.correct[i]).length;
      perElective[e] = round2(members.length ? (c / members.length) * 100 : 0);
      correctAll += c;
      totalAll += members.length;
      applicable.push(e);
    }

    const electiveTag =
      applicable.length > 0 && applicable.length < electivesPresent.length
        ? applicable.map((e) => ELECTIVE_SHORT[e]).join("·")
        : null;

    return {
      label,
      correctRate: round2(totalAll ? (correctAll / totalAll) * 100 : 0),
      correctCount: correctAll,
      total: totalAll,
      perElective,
      electiveTag,
    };
  });
}
