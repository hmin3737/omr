import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas-pro";
import { ELECTIVE_SHORT, type StatReport, type StatKey } from "./stats";

const STAT_LABELS: Record<StatKey, string> = {
  count: "응시자수",
  mean: "평균",
  stdev: "표준편차",
  perfect: "100점 수",
  top30: "상위 30% 평균",
  percentile: "무보정 백분위",
  standardScore: "무보정 표준점수",
  grade: "무보정 등급",
};

/** break down 시 선택과목별 값을 "(미적 80 · 확통 40)" 형태 문자열로 */
function bd(report: StatReport, pick: (es: StatReport["electiveStats"][number]) => number | string): string {
  if (!report.breakdown) return "";
  return ` (${report.electiveStats.map((es) => `${es.short} ${pick(es)}`).join(" · ")})`;
}

/** 통계 요약을 [항목, 값] 쌍 배열로 만든다 (선택된 항목만) */
function summaryPairs(report: StatReport): [string, string][] {
  const o = report.options.selected;
  const pairs: [string, string][] = [];
  if (o.count) pairs.push([STAT_LABELS.count, `${report.count}명${bd(report, (es) => es.count)}`]);
  if (o.mean) pairs.push([STAT_LABELS.mean, `${report.mean}${bd(report, (es) => es.mean)}`]);
  if (o.stdev) pairs.push([STAT_LABELS.stdev, `${report.stdev}${bd(report, (es) => es.stdev)}`]);
  if (o.perfect) {
    if (report.perfectCount > 0) {
      pairs.push([
        STAT_LABELS.perfect,
        `${report.perfectCount}명${bd(report, (es) => es.perfectCount)}`,
      ]);
    } else {
      pairs.push([
        STAT_LABELS.perfect,
        `0명 (최고점 ${report.maxScore}점 · ${report.maxScoreCount}명)`,
      ]);
    }
  }
  if (o.top30) pairs.push([STAT_LABELS.top30, `${report.top30Mean} (상위 ${report.top30N}명)`]);
  return pairs;
}

export function buildXlsx(report: StatReport): void {
  const wb = XLSX.utils.book_new();
  const aoa: (string | number)[][] = [];

  aoa.push([`${report.examName} 통계 자료`]);
  aoa.push([
    `점수 산출 ${report.count + report.removedCount}명 중 분석 ${report.count}명` +
      (report.removedCount ? ` (허수 ${report.removedCount}명 제거)` : "") +
      (report.ungradedCount ? ` · 미산출 ${report.ungradedCount}명 제외` : ""),
  ]);
  aoa.push([]);

  // 통계 요약
  for (const [k, v] of summaryPairs(report)) aoa.push([k, v]);

  // 정답률 낮은 문제
  aoa.push([]);
  aoa.push([`정답률 ${report.options.lowAccuracyThreshold}% 미만 문제`]);
  if (report.lowAccuracy.length) {
    const head: (string | number)[] = ["문항", "전체(%)"];
    if (report.breakdown) {
      for (const e of report.electivesPresent) head.push(`${ELECTIVE_SHORT[e]}(%)`);
    }
    head.push("정답 인원");
    aoa.push(head);
    for (const q of report.lowAccuracy) {
      const line: (string | number)[] = [
        q.label + (q.electiveTag ? ` (${q.electiveTag})` : ""),
        q.correctRate,
      ];
      if (report.breakdown) {
        for (const e of report.electivesPresent) {
          const v = q.perElective?.[e];
          line.push(v === null || v === undefined ? "" : v);
        }
      }
      line.push(`${q.correctCount}/${q.total}`);
      aoa.push(line);
    }
  } else {
    aoa.push(["해당 문항 없음"]);
  }

  // 원점수 환산표 (선택 항목 중 백분위/표준점수/등급이 있을 때)
  const o = report.options.selected;
  if (o.percentile || o.standardScore || o.grade) {
    aoa.push([]);
    aoa.push(["원점수 환산표"]);
    const head = ["원점수"];
    if (o.standardScore) head.push("표준점수");
    if (o.percentile) head.push("백분위");
    if (o.grade) head.push("등급");
    aoa.push(head);
    for (const row of report.conversion) {
      const line: (string | number)[] = [row.rawScore];
      if (o.standardScore) line.push(row.standardScore);
      if (o.percentile) line.push(row.percentile);
      if (o.grade) line.push(row.grade);
      aoa.push(line);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws, "통계");
  XLSX.writeFile(wb, `${sanitize(report.examName)}_통계.xlsx`);
}

export async function buildPdf(el: HTMLElement, report: StatReport): Promise<void> {
  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
  });
  const img = canvas.toDataURL("image/png");

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;

  // 한 페이지에 들어가도록 비율 유지하며 축소
  const ratio = Math.min(maxW / canvas.width, maxH / canvas.height);
  const w = canvas.width * ratio;
  const h = canvas.height * ratio;
  pdf.addImage(img, "PNG", (pageW - w) / 2, margin, w, h);
  pdf.save(`${sanitize(report.examName)}_통계.pdf`);
}

function sanitize(name: string): string {
  return (name || "통계자료").replace(/[\\/:*?"<>|]/g, "_").trim();
}
