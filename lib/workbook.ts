import * as XLSX from "xlsx";

// 한국 학원/OMR 소프트웨어가 내보내는 csv는 EUC-KR(CP949)로 인코딩된 경우가 흔하다.
// (xls/xlsx는 자체적으로 인코딩 정보를 포함하므로 이 문제가 없다.)
// UTF-8로 엄격 디코딩을 시도해 실패하면 EUC-KR로 재시도한다 — EUC-KR 한글 바이트 시퀀스는
// 대부분 유효한 UTF-8 시퀀스가 아니므로 이 방식으로 안정적으로 구분할 수 있다.
function decodeCsvBuffer(buf: ArrayBuffer): string {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return text.replace(/^﻿/, "");
  } catch {
    return new TextDecoder("euc-kr").decode(buf);
  }
}

/** 파일 확장자에 따라 인코딩 문제 없이 워크북으로 읽는다 */
export async function readWorkbookFile(file: File): Promise<XLSX.WorkBook> {
  const buf = await file.arrayBuffer();
  const isCsv = file.name.toLowerCase().endsWith(".csv") || file.type.includes("csv");
  if (isCsv) {
    return XLSX.read(decodeCsvBuffer(buf), { type: "string" });
  }
  return XLSX.read(buf, { type: "array" });
}
