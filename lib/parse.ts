import * as XLSX from "xlsx";
import type { ParsedResult, StudentRecord } from "./stats";

// 채점결과 파일 구조 (OMR 출력)
//   행 0: 헤더  [성명, 수험번호, 선택, 점수, 1, 2, 3, ... , 단16, ...]
//   행 1~: 학생  [이름, 수험번호, 선택, 점수, 'O'/오답값/공백, ...]
//   - 점수 칸이 비어 있으면 미응시·미채점(점수 미산출) → score=null
//   - 문항 칸이 'O' 이면 정답, 그 외(숫자/공백)는 오답

const NAME_KEYS = ["성명", "이름", "name"];
const ID_KEYS = ["수험번호", "번호", "id"];
const SCORE_KEYS = ["점수", "총점", "score"];
const META_KEYS = ["선택", "구분", "반"]; // 문항이 아닌 부가 컬럼

export async function parseFile(file: File, examName: string): Promise<ParsedResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  });
  if (!rows.length) throw new Error("빈 파일입니다.");

  const header = rows[0].map((c) => String(c ?? "").trim());

  const findCol = (keys: string[]) =>
    header.findIndex((h) => keys.some((k) => h.toLowerCase() === k.toLowerCase()));

  const nameCol = findCol(NAME_KEYS);
  const idCol = findCol(ID_KEYS);
  const scoreCol = findCol(SCORE_KEYS);
  if (scoreCol < 0) {
    throw new Error("'점수' 컬럼을 찾을 수 없습니다. 헤더를 확인하세요.");
  }

  // 문항 컬럼: 점수 컬럼 이후의 모든 컬럼 중 메타 컬럼을 제외
  const metaCols = new Set([nameCol, idCol, scoreCol]);
  META_KEYS.forEach((k) => {
    const idx = header.findIndex((h) => h === k);
    if (idx >= 0) metaCols.add(idx);
  });

  const questionCols: number[] = [];
  for (let c = scoreCol + 1; c < header.length; c++) {
    if (!metaCols.has(c) && header[c] !== "") questionCols.push(c);
  }
  const questionLabels = questionCols.map((c) => header[c]);

  const students: StudentRecord[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c) => String(c ?? "").trim() === "")) continue;

    const rawScore = row[scoreCol];
    const scoreNum = typeof rawScore === "number" ? rawScore : Number(String(rawScore).trim());
    const score = String(rawScore ?? "").trim() === "" || Number.isNaN(scoreNum) ? null : scoreNum;

    const correct = questionCols.map((c) => String(row[c] ?? "").trim().toUpperCase() === "O");

    students.push({
      name: nameCol >= 0 ? String(row[nameCol] ?? "").trim() : `학생${r}`,
      id: idCol >= 0 ? String(row[idCol] ?? "").trim() : "",
      score,
      correct,
    });
  }

  return { examName, questionLabels, students };
}
