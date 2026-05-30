// OMR 채점결과 파싱 및 통계 산출 로직
//
// 수능(대학수학능력시험) 준용 계산식 (국어·수학 기준: 평균 100, 표준편차 20)
//   - 표준점수  = (원점수 - 평균) / 표준편차 × 20 + 100
//   - 백분위    = (본인보다 낮은 점수 인원 + 동점자 수 ÷ 2) / 전체 인원 × 100
//   - 등급      = 상위 누적비율 컷(4/11/23/40/60/77/89/96/100%) 기준, 동점자는 상위 등급으로 처리
//
// 모든 통계는 "점수가 산출된(미응시·미채점 제외) 응시자"만을 대상으로 한다.
// 허수 제거 시에는 기준 점수 이하의 응시자를 제거한 뒤 계산한다.
// 소수점은 소수 셋째 자리에서 반올림(=소수 둘째 자리까지)한다.

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
  /** 문항별 정답 여부. 'O' 이면 정답, 그 외(오답/공백)는 false */
  correct: boolean[];
}

export interface QuestionAccuracy {
  label: string;
  correctRate: number; // %
  correctCount: number;
  total: number;
}

export interface ConversionRow {
  rawScore: number;
  standardScore: number;
  percentile: number;
  grade: number;
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
  const count = scores.length;

  const mean = count ? scores.reduce((a, b) => a + b, 0) / count : 0;
  const variance = count
    ? scores.reduce((a, b) => a + (b - mean) ** 2, 0) / count // 모표준편차
    : 0;
  const stdev = Math.sqrt(variance);

  const perfectCount = scores.filter((s) => s === 100).length;
  const maxScore = count ? Math.max(...scores) : 0;
  const maxScoreCount = scores.filter((s) => s === maxScore).length;

  // 상위 30% 평균: 점수 내림차순 정렬 후 상위 30% 인원(반올림)
  const sortedDesc = [...scores].sort((a, b) => b - a);
  const top30N = Math.round(count * 0.3);
  const top30Slice = sortedDesc.slice(0, top30N);
  const top30Mean = top30N
    ? top30Slice.reduce((a, b) => a + b, 0) / top30N
    : 0;

  // 환산표: 시험에 존재하는 각 원점수 → 표준점수/백분위/등급
  const conversion = buildConversion(scores, mean, stdev);

  // 문항별 정답률 (kept 학생 기준)
  const allAccuracy = computeAccuracy(kept, parsed.questionLabels);
  const lowAccuracy = allAccuracy
    .filter((q) => q.correctRate < options.lowAccuracyThreshold)
    .sort((a, b) => a.correctRate - b.correctRate);

  return {
    examName: parsed.examName,
    count,
    removedCount,
    ungradedCount,
    mean: round2(mean),
    stdev: round2(stdev),
    perfectCount,
    maxScore: round2(maxScore),
    maxScoreCount,
    top30Mean: round2(top30Mean),
    top30N,
    conversion,
    lowAccuracy,
    allAccuracy,
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

function computeAccuracy(students: StudentRecord[], labels: string[]): QuestionAccuracy[] {
  const total = students.length;
  return labels.map((label, i) => {
    const correctCount = students.filter((s) => s.correct[i]).length;
    const correctRate = total ? (correctCount / total) * 100 : 0;
    return { label, correctRate: round2(correctRate), correctCount, total };
  });
}
