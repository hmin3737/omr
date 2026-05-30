"use client";

import { useRef, useState } from "react";
import { parseFile } from "@/lib/parse";
import { computeReport, type StatKey, type StatReport } from "@/lib/stats";
import { buildXlsx, buildPdf } from "@/lib/export";
import ReportView from "./ReportView";

const STAT_ITEMS: { key: StatKey; label: string }[] = [
  { key: "count", label: "응시자수" },
  { key: "mean", label: "평균" },
  { key: "stdev", label: "표준편차" },
  { key: "perfect", label: "100점 수" },
  { key: "top30", label: "상위 30% 평균" },
  { key: "percentile", label: "무보정 백분위" },
  { key: "standardScore", label: "무보정 표준점수" },
  { key: "grade", label: "무보정 등급" },
];

export default function Home() {
  const [examName, setExamName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [cutoff, setCutoff] = useState("");
  const [lowThreshold, setLowThreshold] = useState("50");
  const [selected, setSelected] = useState<Record<StatKey, boolean>>({
    count: true,
    mean: true,
    stdev: true,
    perfect: true,
    top30: true,
    percentile: true,
    standardScore: true,
    grade: true,
  });
  const [report, setReport] = useState<StatReport | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const toggle = (k: StatKey) =>
    setSelected((s) => ({ ...s, [k]: !s[k] }));

  async function handleGenerate() {
    setError("");
    if (!examName.trim()) return setError("시험명을 입력하세요.");
    if (!file) return setError("채점결과 파일을 올리세요.");
    if (lowThreshold.trim() === "" || Number.isNaN(Number(lowThreshold)))
      return setError("정답률 낮은 문제의 기준(%)을 입력하세요.");

    setBusy(true);
    try {
      const parsed = await parseFile(file, examName.trim());
      const cutoffNum =
        cutoff.trim() === "" || Number.isNaN(Number(cutoff)) ? null : Number(cutoff);
      const rep = computeReport(parsed, {
        cutoff: cutoffNum,
        selected,
        lowAccuracyThreshold: Number(lowThreshold),
      });
      if (rep.count === 0)
        throw new Error("분석 대상 인원이 0명입니다. 허수 제거 기준을 확인하세요.");
      setReport(rep);
    } catch (e) {
      setReport(null);
      setError(e instanceof Error ? e.message : "파일 처리 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePdf() {
    if (report && reportRef.current) await buildPdf(reportRef.current, report);
  }

  return (
    <div className="wrap">
      <h1>OMR 통계 생성기</h1>
      <p className="sub">
        OMR 채점결과 파일을 올리면 시험 통계 자료를 한 페이지짜리 xlsx · pdf로 생성합니다.
      </p>

      <div className="layout">
        <div className="card">
          <div className="field">
            <label className="lab">
              시험명 <span className="req">*</span>
            </label>
            <input
              type="text"
              value={examName}
              onChange={(e) => setExamName(e.target.value)}
              placeholder="예: 2026 1학기 중간고사 수학"
            />
          </div>

          <div className="field">
            <label className="lab">
              채점결과 파일 <span className="req">*</span>
            </label>
            <input
              type="file"
              accept=".xls,.xlsx,.csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="hint">xls / xlsx / csv 지원. 데이터는 브라우저 안에서만 처리됩니다.</p>
          </div>

          <div className="field">
            <label className="lab">허수 표본 제거 기준 (선택)</label>
            <input
              type="number"
              value={cutoff}
              onChange={(e) => setCutoff(e.target.value)}
              placeholder="예: 20 → 20점 이하 제거"
            />
            <p className="hint">입력한 점수 이하의 응시자를 통계에서 제외합니다.</p>
          </div>

          <div className="field">
            <label className="lab">
              정답률 낮은 문제 기준(%) <span className="req">*</span>
            </label>
            <input
              type="number"
              value={lowThreshold}
              onChange={(e) => setLowThreshold(e.target.value)}
              placeholder="예: 50 → 정답률 50% 미만 표시"
            />
          </div>

          <div className="field">
            <label className="lab">원하는 통계 자료</label>
            <div className="checks">
              {STAT_ITEMS.map((it) => (
                <label className="check" key={it.key}>
                  <input
                    type="checkbox"
                    checked={selected[it.key]}
                    onChange={() => toggle(it.key)}
                  />
                  {it.label}
                </label>
              ))}
            </div>
          </div>

          <button className="btn" onClick={handleGenerate} disabled={busy}>
            {busy ? "생성 중..." : "통계 생성"}
          </button>
          {report && (
            <div className="btn-row">
              <button className="btn secondary" onClick={() => buildXlsx(report)}>
                xlsx 내려받기
              </button>
              <button className="btn secondary" onClick={handlePdf}>
                pdf 내려받기
              </button>
            </div>
          )}
          {error && <div className="error">{error}</div>}
        </div>

        <div>
          {report ? (
            <ReportView report={report} ref={reportRef} />
          ) : (
            <div className="report">
              <p className="placeholder">
                좌측에서 정보를 입력하고 <b>통계 생성</b>을 누르면 결과가 여기에 표시됩니다.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
