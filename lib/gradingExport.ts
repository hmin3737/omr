// "학생답안" 채점 결과로부터 Extension 06_채점결과.xls / (교사용) 문항분석.xls 과
// 정확히 같은 열 구조의 파일을 만든다. xls(레거시 바이너리)·csv 두 형식 모두 지원.

import * as XLSX from "xlsx";
import { ELECTIVE_LONG } from "./stats";
import { sanitize } from "./export";
import { questionLabel, type Elective, type GradingResult } from "./rawAnswers";

type Cell = string | number;

const OPTIONS: Elective[] = [1, 2, 3];

/** 숫자로만 이뤄진 문자열이면 number로, 아니면 원문 그대로 (샘플 파일과 동일하게 숫자형 셀 유지) */
function maybeNumber(v: string): Cell {
  const t = v.trim();
  return /^-?\d+$/.test(t) ? Number(t) : t;
}

/** 채점결과 파일용 AOA (Extension 06_채점결과.xls 와 동일한 열 구조) */
export function buildGradedResultAoa(result: GradingResult): Cell[][] {
  const header: Cell[] = ["성명", "수험번호", "선택", "점수"];
  for (const q of result.key.questions) {
    header.push(q.type === "short" ? `단${q.number}` : q.number);
  }

  const rows: Cell[][] = [header];
  for (const s of result.students) {
    if (s.score === null) {
      rows.push([s.name, s.id, " ", "", ...result.key.questions.map(() => "")]);
      continue;
    }
    const row: Cell[] = [s.name, s.id, s.elective ?? "", s.score];
    for (const p of s.perQuestion) {
      row.push(p.correct ? "O" : p.answered ? maybeNumber(p.rawAnswer) : "   ");
    }
    rows.push(row);
  }
  return rows;
}

/** 문항분석 파일용 AOA. csvHeader=true 이면 1~5% 헤더를 일반 텍스트로 둔다(csv엔 셀서식이 없으므로). */
export function buildQuestionAnalysisAoa(result: GradingResult): Cell[][] {
  const header: Cell[] = [
    "선택과목",
    "번호",
    "정답",
    "배점",
    "유형",
    "정답률",
    "1선택",
    "2선택",
    "3선택",
    "4선택",
    "5선택",
    "1%",
    "2%",
    "3%",
    "4%",
    "5%",
  ];
  const rows: Cell[][] = [header];

  for (const e of OPTIONS) {
    const group = result.students.filter((s) => s.elective === e && s.score !== null);
    const total = group.length;

    result.key.questions.forEach((q, i) => {
      const keyAnswer = q.number < result.key.electiveStart ? q.answer : q.answers[e];
      const row: Cell[] = [
        ELECTIVE_LONG[e],
        questionLabel(q),
        maybeNumber(keyAnswer || ""),
        q.points,
        " ",
      ];

      if (total === 0) {
        row.push("", "", "", "", "", "", "", "", "", "", "");
        rows.push(row);
        return;
      }

      const correctCount = group.filter((s) => s.perQuestion[i].correct).length;
      row.push(Math.round((correctCount / total) * 100));

      if (q.type === "short") {
        row.push("", "", "", "", "", "", "", "", "", "");
      } else {
        const counts = [1, 2, 3, 4, 5].map(
          (opt) => group.filter((s) => s.perQuestion[i].rawAnswer.trim() === String(opt)).length
        );
        counts.forEach((c) => row.push(c));
        counts.forEach((c) => row.push(Math.round((c / total) * 100)));
      }
      rows.push(row);
    });
  }

  return rows;
}

function toSheet(aoa: Cell[][], percentHeaderCols?: string[]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // 문항분석 헤더의 1~5% 칸은 원본 샘플처럼 숫자(0.01~0.05)+퍼센트 서식으로 표시한다.
  if (percentHeaderCols) {
    percentHeaderCols.forEach((col, i) => {
      ws[`${col}1`] = { t: "n", v: (i + 1) / 100, z: "0%" };
    });
  }
  return ws;
}

function writeWorkbook(ws: XLSX.WorkSheet, sheetName: string, filename: string, format: "xls" | "csv") {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  if (format === "xls") {
    XLSX.writeFile(wb, `${filename}.xls`, { bookType: "biff8" });
  } else {
    const csv = XLSX.utils.sheet_to_csv(ws);
    downloadBlob(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), `${filename}.csv`);
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadGradedResult(result: GradingResult, format: "xls" | "csv"): void {
  const ws = toSheet(buildGradedResultAoa(result));
  writeWorkbook(ws, "채점결과", `${sanitize(result.examName)}_채점결과`, format);
}

export function downloadQuestionAnalysis(result: GradingResult, format: "xls" | "csv"): void {
  const ws = toSheet(buildQuestionAnalysisAoa(result), ["L", "M", "N", "O", "P"]);
  writeWorkbook(ws, "문항분석", `${sanitize(result.examName)}_문항분석`, format);
}

/** 채점결과를 저장(시험 저장)용 File 객체로 변환 (표준 채점결과 xls 포맷) */
export function gradedResultToFile(result: GradingResult): File {
  const ws = toSheet(buildGradedResultAoa(result));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "채점결과");
  const buf: ArrayBuffer = XLSX.write(wb, { bookType: "biff8", type: "array" });
  return new File([buf], `${sanitize(result.examName)}_채점결과.xls`, {
    type: "application/vnd.ms-excel",
  });
}

/** 이메일 첨부용: 같은 산출물을 base64로 반환 */
export function gradedResultBase64(
  result: GradingResult,
  format: "xls" | "csv"
): { base64: string; filename: string; mimeType: string } {
  return toBase64(buildGradedResultAoa(result), `${sanitize(result.examName)}_채점결과`, format, undefined);
}

export function questionAnalysisBase64(
  result: GradingResult,
  format: "xls" | "csv"
): { base64: string; filename: string; mimeType: string } {
  return toBase64(
    buildQuestionAnalysisAoa(result),
    `${sanitize(result.examName)}_문항분석`,
    format,
    ["L", "M", "N", "O", "P"]
  );
}

function toBase64(
  aoa: Cell[][],
  filename: string,
  format: "xls" | "csv",
  percentHeaderCols: string[] | undefined
): { base64: string; filename: string; mimeType: string } {
  const ws = toSheet(aoa, percentHeaderCols);
  if (format === "xls") {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf: ArrayBuffer = XLSX.write(wb, { bookType: "biff8", type: "array" });
    return {
      base64: arrayBufferToBase64(buf),
      filename: `${filename}.xls`,
      mimeType: "application/vnd.ms-excel",
    };
  }
  const csv = "﻿" + XLSX.utils.sheet_to_csv(ws);
  return {
    base64: btoa(unescape(encodeURIComponent(csv))),
    filename: `${filename}.csv`,
    mimeType: "text/csv;charset=utf-8",
  };
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
