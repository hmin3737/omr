"use client";

import { useEffect, useRef, useState } from "react";
import { parseFile } from "@/lib/parse";
import { computeReport, type StatKey, type StatReport } from "@/lib/stats";
import { buildXlsx, buildPdf, statXlsxBase64 } from "@/lib/export";
import {
  parseRawAnswers,
  gradeRawAnswers,
  gradedToParsedResult,
  buildDefaultAnswerKey,
  type AnswerKeyPayload,
  type GradingResult,
} from "@/lib/rawAnswers";
import {
  downloadGradedResult,
  downloadQuestionAnalysis,
  gradedResultBase64,
  questionAnalysisBase64,
  gradedResultToFile,
  fileToAttachment,
} from "@/lib/gradingExport";
import {
  createExam,
  createClass,
  deleteClass,
  deleteExam,
  downloadExamFile,
  downloadExamRawFile,
  fetchExamFile,
  fetchExamRawFile,
  listClasses,
  listExams,
  updateClass,
  updateExam,
  CLASS_COLORS,
  type ClassGroup,
  type ExamSettings,
  type SavedExam,
} from "@/lib/store";
import Link from "next/link";
import { CHANGELOG, LATEST } from "@/lib/changelog";
import ReportView from "./ReportView";
import AnswerKeyGrid from "./AnswerKeyGrid";
import EmailButton from "./EmailButton";

type Mode = "graded" | "raw";

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

const DEFAULT_SELECTED: Record<StatKey, boolean> = {
  count: true,
  mean: true,
  stdev: true,
  perfect: true,
  top30: true,
  percentile: false,
  standardScore: false,
  grade: false,
};

function parseElectiveStart(v: string): number | null {
  const n = Number(v);
  return v.trim() === "" || Number.isNaN(n) ? null : n;
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("graded");
  const [examName, setExamName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [answerKey, setAnswerKey] = useState<AnswerKeyPayload>(() => buildDefaultAnswerKey(30, 23));
  const [templateName, setTemplateName] = useState("");
  const [gradingResult, setGradingResult] = useState<GradingResult | null>(null);
  const [gradedFormat, setGradedFormat] = useState<"xls" | "csv">("xls");
  const [qaFormat, setQaFormat] = useState<"xls" | "csv">("xls");
  const [emailChecks, setEmailChecks] = useState({ graded: true, qa: true, raw: true });
  const [cutoff, setCutoff] = useState("50");
  const [lowThreshold, setLowThreshold] = useState("50");
  const [electiveStart, setElectiveStart] = useState("23");
  const [note, setNote] = useState("");
  const [classId, setClassId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<StatKey, boolean>>(DEFAULT_SELECTED);
  const [showChangelog, setShowChangelog] = useState(false);
  const [classes, setClasses] = useState<ClassGroup[]>([]);
  const [showClasses, setShowClasses] = useState(false);
  const [report, setReport] = useState<StatReport | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // 저장된 시험 관리
  const [exams, setExams] = useState<SavedExam[]>([]);
  const [examsLoading, setExamsLoading] = useState(true);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const reportRef = useRef<HTMLDivElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<string | null>(null);

  const currentExam = exams.find((e) => e.id === currentId) ?? null;

  useEffect(() => {
    refreshExams();
    refreshClasses();
  }, []);

  async function refreshExams() {
    try {
      setExams(await listExams());
    } catch {
      /* 목록 조회 실패는 무시 */
    } finally {
      setExamsLoading(false);
    }
  }

  async function refreshClasses() {
    try {
      setClasses(await listClasses());
    } catch {
      /* 무시 */
    }
  }

  const toggle = (k: StatKey) => setSelected((s) => ({ ...s, [k]: !s[k] }));
  const toggleEmailCheck = (k: keyof typeof emailChecks) =>
    setEmailChecks((s) => ({ ...s, [k]: !s[k] }));

  async function buildSelectedAttachments() {
    const atts: { base64: string; filename: string; mimeType: string }[] = [];
    if (emailChecks.graded && gradingResult) atts.push(gradedResultBase64(gradingResult, gradedFormat));
    if (emailChecks.qa && gradingResult) atts.push(questionAnalysisBase64(gradingResult, qaFormat));
    if (emailChecks.raw && rawFile) atts.push(await fileToAttachment(rawFile));
    return atts;
  }

  function currentSettings(): ExamSettings {
    return { cutoff, lowThreshold, electiveStart, selected };
  }

  function buildReport(parsedSource: File, name: string) {
    return (async () => {
      const parsed = await parseFile(parsedSource, name);
      const cutoffNum =
        cutoff.trim() === "" || Number.isNaN(Number(cutoff)) ? null : Number(cutoff);
      const rep = computeReport(parsed, {
        cutoff: cutoffNum,
        selected,
        lowAccuracyThreshold: Number(lowThreshold),
        electiveStart: parseElectiveStart(electiveStart),
      });
      if (rep.count === 0)
        throw new Error("분석 대상 인원이 0명입니다. 허수 제거 기준을 확인하세요.");
      return rep;
    })();
  }

  // 학생답안 + 정답키로 채점하고, 기존 computeReport 를 그대로 재사용해 리포트를 만든다.
  async function runRawGrading(): Promise<{ report: StatReport; result: GradingResult }> {
    if (!rawFile) throw new Error("학생답안 파일을 올리세요.");
    const parsed = await parseRawAnswers(rawFile, examName.trim());
    const result = gradeRawAnswers(parsed, answerKey);
    const parsedResult = gradedToParsedResult(result);
    const cutoffNum = cutoff.trim() === "" || Number.isNaN(Number(cutoff)) ? null : Number(cutoff);
    const rep = computeReport(parsedResult, {
      cutoff: cutoffNum,
      selected,
      lowAccuracyThreshold: Number(lowThreshold),
      electiveStart: answerKey.electiveStart,
    });
    if (rep.count === 0)
      throw new Error("분석 대상 인원이 0명입니다. 허수 제거 기준을 확인하세요.");
    return { report: rep, result };
  }

  async function handleGenerate() {
    setError("");
    setNotice("");
    if (!examName.trim()) return setError("시험명을 입력하세요.");
    if (lowThreshold.trim() === "" || Number.isNaN(Number(lowThreshold)))
      return setError("정답률 낮은 문제의 기준(%)을 입력하세요.");

    if (mode === "raw") {
      if (!rawFile) return setError("학생답안 파일을 올리세요.");
      setBusy(true);
      try {
        const { report: rep, result } = await runRawGrading();
        setGradingResult(result);
        setReport(rep);
      } catch (e) {
        setReport(null);
        setGradingResult(null);
        setError(e instanceof Error ? e.message : "채점 중 오류가 발생했습니다.");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!file) return setError("채점결과 파일을 올리세요.");
    setBusy(true);
    try {
      setReport(await buildReport(file, examName.trim()));
    } catch (e) {
      setReport(null);
      setError(e instanceof Error ? e.message : "파일 처리 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  // 현재 입력을 새 시험으로 저장하거나, 불러온 시험이면 덮어쓴다.
  async function handleSave() {
    setError("");
    setNotice("");
    if (!examName.trim()) return setError("시험명을 입력하세요.");

    if (mode === "raw") {
      if (!rawFile) return setError("학생답안 파일을 올리세요.");
      setBusy(true);
      try {
        const { report: rep, result } = await runRawGrading();
        setGradingResult(result);
        setReport(rep);
        const gradedFile = gradedResultToFile(result);
        const settings: ExamSettings = {
          cutoff,
          lowThreshold,
          electiveStart: String(answerKey.electiveStart),
          selected,
        };
        if (currentExam) {
          await updateExam(currentExam.id, {
            name: examName.trim(),
            settings,
            note,
            classId,
            file: gradedFile,
            rawFile,
            answerKey,
          });
          setNotice("시험을 갱신했습니다.");
        } else {
          const created = await createExam(examName.trim(), gradedFile, settings, note, classId, {
            rawFile,
            answerKey,
          });
          setCurrentId(created.id);
          setNotice("시험을 저장했습니다.");
        }
        await refreshExams();
      } catch (e) {
        setError(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!file && !currentExam) return setError("채점결과 파일을 올리세요.");

    setBusy(true);
    try {
      const settings = currentSettings();
      if (currentExam) {
        const patch: Parameters<typeof updateExam>[1] = {
          name: examName.trim(),
          settings,
          note,
        };
        if (file) patch.file = file;
        patch.classId = classId;
        await updateExam(currentExam.id, patch);
        setNotice("시험을 갱신했습니다.");
      } else {
        const created = await createExam(examName.trim(), file as File, settings, note, classId);
        setCurrentId(created.id);
        setNotice("시험을 저장했습니다.");
      }
      await refreshExams();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  // 저장된 시험을 폼으로 불러오고 통계를 재생성한다.
  async function handleLoad(exam: SavedExam) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      setExamName(exam.name);
      setCutoff(exam.settings.cutoff);
      setLowThreshold(exam.settings.lowThreshold);
      setElectiveStart(exam.settings.electiveStart ?? "23");
      setNote(exam.note ?? "");
      setClassId(exam.classId ?? null);
      setSelected(exam.settings.selected);
      setCurrentId(exam.id);

      if (exam.sourceType === "raw" && exam.answerKey) {
        setMode("raw");
        setFile(null);
        setAnswerKey(exam.answerKey);
        setTemplateName(exam.name);
        const rf = await fetchExamRawFile(exam);
        setRawFile(rf);

        const parsed = await parseRawAnswers(rf, exam.name);
        const result = gradeRawAnswers(parsed, exam.answerKey);
        setGradingResult(result);
        const parsedResult = gradedToParsedResult(result);
        const cutoffNum =
          exam.settings.cutoff.trim() === "" || Number.isNaN(Number(exam.settings.cutoff))
            ? null
            : Number(exam.settings.cutoff);
        const rep = computeReport(parsedResult, {
          cutoff: cutoffNum,
          selected: exam.settings.selected,
          lowAccuracyThreshold: Number(exam.settings.lowThreshold) || 0,
          electiveStart: exam.answerKey.electiveStart,
        });
        setReport(rep.count === 0 ? null : rep);
        if (rep.count === 0) setError("분석 대상 인원이 0명입니다. 허수 제거 기준을 확인하세요.");
        else setNotice(`"${exam.name}" 시험을 불러왔습니다.`);
        return;
      }

      setMode("graded");
      setRawFile(null);
      setGradingResult(null);
      const f = await fetchExamFile(exam);
      setFile(f);

      // 불러오기 즉시 통계를 재생성 (저장된 설정 사용)
      const parsed = await parseFile(f, exam.name);
      const cutoffNum =
        exam.settings.cutoff.trim() === "" || Number.isNaN(Number(exam.settings.cutoff))
          ? null
          : Number(exam.settings.cutoff);
      const rep = computeReport(parsed, {
        cutoff: cutoffNum,
        selected: exam.settings.selected,
        lowAccuracyThreshold: Number(exam.settings.lowThreshold) || 0,
        electiveStart: parseElectiveStart(exam.settings.electiveStart ?? "23"),
      });
      setReport(rep.count === 0 ? null : rep);
      if (rep.count === 0) setError("분석 대상 인원이 0명입니다. 허수 제거 기준을 확인하세요.");
      else setNotice(`"${exam.name}" 시험을 불러왔습니다.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오는 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRename(exam: SavedExam) {
    const next = window.prompt("새 시험명을 입력하세요.", exam.name);
    if (next === null) return;
    if (!next.trim()) return setError("시험명은 비울 수 없습니다.");
    try {
      await updateExam(exam.id, { name: next.trim() });
      if (currentId === exam.id) setExamName(next.trim());
      await refreshExams();
      setNotice("시험명을 변경했습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "이름 변경 중 오류가 발생했습니다.");
    }
  }

  // 특정 시험의 원본 파일 교체 (숨겨진 file input을 통해)
  function startReplace(examId: string) {
    replaceTargetRef.current = examId;
    replaceInputRef.current?.click();
  }

  async function handleReplacePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 가능하도록 초기화
    const targetId = replaceTargetRef.current;
    replaceTargetRef.current = null;
    if (!picked || !targetId) return;
    try {
      const updated = await updateExam(targetId, { file: picked });
      await refreshExams();
      setNotice("원본 파일을 교체했습니다.");
      if (currentId === targetId) await handleLoad(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "파일 교체 중 오류가 발생했습니다.");
    }
  }

  async function handleDelete(exam: SavedExam) {
    if (!window.confirm(`"${exam.name}" 시험을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      await deleteExam(exam.id);
      if (currentId === exam.id) setCurrentId(null);
      await refreshExams();
      setNotice("시험을 삭제했습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제 중 오류가 발생했습니다.");
    }
  }

  function handleNew() {
    setCurrentId(null);
    setExamName("");
    setFile(null);
    setMode("graded");
    setRawFile(null);
    setAnswerKey(buildDefaultAnswerKey(30, 23));
    setTemplateName("");
    setGradingResult(null);
    setCutoff("50");
    setLowThreshold("50");
    setElectiveStart("23");
    setNote("");
    setClassId(null);
    setSelected(DEFAULT_SELECTED);
    setReport(null);
    setError("");
    setNotice("");
  }

  async function handlePdf() {
    if (report && reportRef.current) await buildPdf(reportRef.current, report);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="wrap">
      <div className="banner">
        <div className="banner-main">
          <span className="banner-badge">v{LATEST.version}</span>
          <span className="banner-title">{LATEST.title}</span>
          <span className="banner-date">{LATEST.date}</span>
        </div>
        <div className="banner-actions">
          <Link href="/trends" className="banner-btn ghost">
            반별 추세
          </Link>
          <button className="banner-btn" onClick={() => setShowChangelog(true)}>
            패치 노트
          </button>
          <button className="banner-btn ghost" onClick={handleLogout}>
            로그아웃
          </button>
        </div>
      </div>

      {showChangelog && <ChangelogModal onClose={() => setShowChangelog(false)} />}
      {showClasses && (
        <ClassesModal
          classes={classes}
          onClose={() => setShowClasses(false)}
          onChanged={async () => {
            await refreshClasses();
            await refreshExams();
          }}
        />
      )}

      <h1>OMR 통계 생성기</h1>
      <p className="sub">
        OMR 채점결과 파일을 올리면 시험 통계 자료를 한 페이지짜리 xlsx · pdf로 생성합니다.
        시험을 저장하면 나중에 언제든 통계를 다시 만들고 원본 파일도 내려받을 수 있습니다.
      </p>

      <input
        ref={replaceInputRef}
        type="file"
        accept=".xls,.xlsx,.csv"
        style={{ display: "none" }}
        onChange={handleReplacePicked}
      />

      <div className="layout">
        <div className="card">
          {currentExam && (
            <div className="editing-tag">
              편집 중: <b>{currentExam.name}</b>
              <button className="link-btn" onClick={handleNew}>
                새 시험으로
              </button>
            </div>
          )}

          <div className="mode-tabs">
            <button
              type="button"
              className={mode === "graded" ? "mode-tab active" : "mode-tab"}
              onClick={() => setMode("graded")}
            >
              채점결과 업로드
            </button>
            <button
              type="button"
              className={mode === "raw" ? "mode-tab active" : "mode-tab"}
              onClick={() => setMode("raw")}
            >
              학생답안 업로드
            </button>
          </div>

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
            <label className="lab">반 (선택)</label>
            <div className="class-row">
              <select
                className="class-select"
                value={classId ?? ""}
                onChange={(e) => setClassId(e.target.value || null)}
              >
                <option value="">반 없음</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button type="button" className="btn-mini" onClick={() => setShowClasses(true)}>
                반 관리
              </button>
            </div>
          </div>

          {mode === "graded" ? (
            <div className="field">
              <label className="lab">
                채점결과 파일 {!currentExam && <span className="req">*</span>}
              </label>
              <input
                type="file"
                accept=".xls,.xlsx,.csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="hint">
                {currentExam
                  ? "비워두면 저장된 원본 파일을 그대로 사용합니다. 새 파일을 올리면 교체됩니다."
                  : "xlsx만 지원. 데이터는 브라우저 안에서만 처리됩니다."}
              </p>
            </div>
          ) : (
            <>
              <div className="field">
                <label className="lab">
                  학생답안 파일 {!rawFile && <span className="req">*</span>}
                </label>
                <input
                  type="file"
                  accept=".xls,.xlsx,.csv"
                  onChange={(e) => setRawFile(e.target.files?.[0] ?? null)}
                />
                <p className="hint">
                  성명·수험번호(또는 전화번호)·선택과목코드 + 문항별 원본 응답 구조의 파일입니다.
                  데이터는 브라우저 안에서만 처리됩니다.
                </p>
              </div>

              <div className="field">
                <label className="lab">문항별 배점 · 정답</label>
                <AnswerKeyGrid
                  value={answerKey}
                  onChange={setAnswerKey}
                  templateName={templateName}
                  onTemplateNameChange={setTemplateName}
                />
              </div>
            </>
          )}

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

          {mode === "graded" && (
            <div className="field">
              <label className="lab">선택과목 시작 문항 번호 (선택)</label>
              <input
                type="number"
                value={electiveStart}
                onChange={(e) => setElectiveStart(e.target.value)}
                placeholder="예: 23 → 23번부터 선택과목 문항"
              />
              <p className="hint">
                이 번호 이상의 문항은 선택과목별로 분리되어 <b>미적30</b>처럼 표기되고, 응시하지 않은
                과목은 <b>-</b>로 표시됩니다. 비우면 적용하지 않습니다.
              </p>
            </div>
          )}

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

          <div className="field">
            <label className="lab">메모 (선택)</label>
            <textarea
              className="memo"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="이 시험에 대한 메모를 남겨두세요. 저장 시 함께 보관됩니다."
              rows={3}
            />
          </div>

          <button className="btn" onClick={handleGenerate} disabled={busy}>
            {busy ? "처리 중..." : "통계 생성"}
          </button>
          <div className="btn-row">
            <button className="btn secondary" onClick={handleSave} disabled={busy}>
              {currentExam ? "시험 갱신 저장" : "시험 저장"}
            </button>
          </div>
          {report && (
            <div className="btn-row">
              <button className="btn secondary" onClick={() => buildXlsx(report)}>
                xlsx 내려받기
              </button>
              <button className="btn secondary" onClick={handlePdf}>
                pdf 내려받기
              </button>
              <EmailButton getAttachment={() => statXlsxBase64(report)} />
            </div>
          )}

          {mode === "raw" && gradingResult && (
            <div className="export-group">
              <div className="export-row">
                <input
                  type="checkbox"
                  checked={emailChecks.graded}
                  onChange={() => toggleEmailCheck("graded")}
                  aria-label="채점결과 이메일에 포함"
                />
                <span className="export-label">채점결과</span>
                <select
                  className="format-select"
                  value={gradedFormat}
                  onChange={(e) => setGradedFormat(e.target.value as "xls" | "csv")}
                >
                  <option value="xls">xls</option>
                  <option value="csv">csv</option>
                </select>
                <button className="btn-mini" onClick={() => downloadGradedResult(gradingResult, gradedFormat)}>
                  다운로드
                </button>
              </div>
              <div className="export-row">
                <input
                  type="checkbox"
                  checked={emailChecks.qa}
                  onChange={() => toggleEmailCheck("qa")}
                  aria-label="문항분석 이메일에 포함"
                />
                <span className="export-label">문항분석</span>
                <select
                  className="format-select"
                  value={qaFormat}
                  onChange={(e) => setQaFormat(e.target.value as "xls" | "csv")}
                >
                  <option value="xls">xls</option>
                  <option value="csv">csv</option>
                </select>
                <button className="btn-mini" onClick={() => downloadQuestionAnalysis(gradingResult, qaFormat)}>
                  다운로드
                </button>
              </div>
              {rawFile && (
                <div className="export-row">
                  <input
                    type="checkbox"
                    checked={emailChecks.raw}
                    onChange={() => toggleEmailCheck("raw")}
                    aria-label="학생답안 원본 이메일에 포함"
                  />
                  <span className="export-label">학생답안 원본</span>
                  <button
                    className="btn-mini"
                    onClick={() => {
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(rawFile);
                      a.download = rawFile.name;
                      a.click();
                      URL.revokeObjectURL(a.href);
                    }}
                  >
                    다운로드
                  </button>
                </div>
              )}
              <div className="export-row">
                <span className="export-label">체크한 항목 한 번에</span>
                <EmailButton
                  getAttachment={buildSelectedAttachments}
                  label="이메일로 보내기"
                  disabled={
                    !(emailChecks.graded || emailChecks.qa) && !(emailChecks.raw && rawFile)
                  }
                />
              </div>
            </div>
          )}
          {error && <div className="error">{error}</div>}
          {notice && <div className="notice">{notice}</div>}
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

          <div className="saved">
            <div className="saved-head">
              <h3>저장된 시험</h3>
              {!examsLoading && <span className="saved-count">{exams.length}개</span>}
            </div>
            {examsLoading ? (
              <div className="saved-loading">
                <span className="spinner" /> 불러오는 중...
              </div>
            ) : exams.length === 0 ? (
              <p className="saved-empty">
                아직 저장된 시험이 없습니다. 왼쪽에서 시험을 입력하고 <b>시험 저장</b>을 누르세요.
              </p>
            ) : (
              <ul className="exam-list">
                {exams.map((ex) => (
                  <li key={ex.id} className={ex.id === currentId ? "exam-item active" : "exam-item"}>
                    <div className="exam-info">
                      <span className="exam-name">
                        {ex.class && (
                          <span
                            className="class-badge"
                            style={{ background: ex.class.color }}
                          >
                            {ex.class.name}
                          </span>
                        )}
                        {ex.sourceType === "raw" && <span className="source-badge">학생답안</span>}
                        {ex.name}
                      </span>
                      <span className="exam-meta">
                        {ex.fileName} · 수정 {fmtDate(ex.updatedAt)}
                      </span>
                      {ex.note && <span className="exam-note">{ex.note}</span>}
                    </div>
                    <div className="exam-actions">
                      <button onClick={() => handleLoad(ex)} disabled={busy}>
                        불러오기
                      </button>
                      <button onClick={() => handleRename(ex)}>이름변경</button>
                      {ex.sourceType !== "raw" && (
                        <button onClick={() => startReplace(ex.id)}>파일교체</button>
                      )}
                      <button onClick={() => downloadExamFile(ex)}>
                        {ex.sourceType === "raw" ? "채점결과 파일" : "채점결과 원본"}
                      </button>
                      {ex.sourceType === "raw" && (
                        <button onClick={() => downloadExamRawFile(ex)}>학생답안 원본</button>
                      )}
                      <button className="danger" onClick={() => handleDelete(ex)}>
                        삭제
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChangelogModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>패치 노트</h2>
          <button className="modal-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        <div className="modal-body">
          {CHANGELOG.map((rel) => (
            <div className="release" key={rel.version}>
              <div className="release-head">
                <span className="release-ver">v{rel.version}</span>
                <span className="release-title">{rel.title}</span>
                <span className="release-date">{rel.date}</span>
              </div>
              <ul className="release-changes">
                {rel.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ClassesModal({
  classes,
  onClose,
  onChanged,
}: {
  classes: ClassGroup[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(CLASS_COLORS[0]);
  const [err, setErr] = useState("");

  async function add() {
    setErr("");
    if (!name.trim()) return setErr("반 이름을 입력하세요.");
    try {
      await createClass(name.trim(), color);
      setName("");
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "생성 실패");
    }
  }

  async function rename(c: ClassGroup) {
    const next = window.prompt("새 반 이름", c.name);
    if (next === null || !next.trim()) return;
    await updateClass(c.id, { name: next.trim() });
    await onChanged();
  }

  async function recolor(c: ClassGroup, col: string) {
    await updateClass(c.id, { color: col });
    await onChanged();
  }

  async function remove(c: ClassGroup) {
    if (!window.confirm(`"${c.name}" 반을 삭제할까요? 이 반의 시험들은 '반 없음'이 됩니다.`)) return;
    await deleteClass(c.id);
    await onChanged();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>반 관리</h2>
          <button className="modal-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="class-add">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="새 반 이름 (예: 3학년 2반)"
            />
            <div className="swatches">
              {CLASS_COLORS.map((col) => (
                <button
                  key={col}
                  type="button"
                  className={col === color ? "swatch active" : "swatch"}
                  style={{ background: col }}
                  onClick={() => setColor(col)}
                  aria-label={col}
                />
              ))}
            </div>
            <button className="btn" onClick={add}>
              반 추가
            </button>
            {err && <div className="error">{err}</div>}
          </div>

          {classes.length > 0 && (
            <ul className="class-list">
              {classes.map((c) => (
                <li key={c.id} className="class-item">
                  <span className="class-badge" style={{ background: c.color }}>
                    {c.name}
                  </span>
                  <div className="swatches sm">
                    {CLASS_COLORS.map((col) => (
                      <button
                        key={col}
                        type="button"
                        className={col === c.color ? "swatch active" : "swatch"}
                        style={{ background: col }}
                        onClick={() => recolor(c, col)}
                        aria-label={col}
                      />
                    ))}
                  </div>
                  <div className="class-item-actions">
                    <button onClick={() => rename(c)}>이름변경</button>
                    <button className="danger" onClick={() => remove(c)}>
                      삭제
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
