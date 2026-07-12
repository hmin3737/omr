import { forwardRef } from "react";
import type { StatReport, ElectiveStat } from "@/lib/stats";

/** break down 시 선택과목별 값을 "미적 74.1 · 확통 66.2" 형태 문자열로 (없으면 "") */
function bdSub(report: StatReport, pick: (es: ElectiveStat) => number | string): string {
  if (!report.breakdown) return "";
  return report.electiveStats.map((es) => `${es.short} ${pick(es)}`).join(" · ");
}

const ReportView = forwardRef<HTMLDivElement, { report: StatReport }>(
  function ReportView({ report }, ref) {
    const o = report.options.selected;
    const showConv = o.percentile || o.standardScore || o.grade;

    return (
      <div className="report" ref={ref}>
        <h2>{report.examName} 통계 자료</h2>
        <div className="meta">
          분석 대상 {report.count}명
          {report.removedCount > 0 && ` · 허수 ${report.removedCount}명 제거`}
          {report.ungradedCount > 0 && ` · 미산출 ${report.ungradedCount}명 제외`}
          {report.breakdown && " · 선택과목별 분리"}
        </div>

        <div className="section-title">시험 통계</div>
        <div className="tiles">
          {o.count && (
            <Tile label="응시자수" value={`${report.count}명`} sub={bdSub(report, (es) => `${es.count}`)} />
          )}
          {o.mean && (
            <Tile label="평균" value={`${report.mean}`} sub={bdSub(report, (es) => es.mean)} />
          )}
          {o.stdev && (
            <Tile label="표준편차" value={`${report.stdev}`} sub={bdSub(report, (es) => es.stdev)} />
          )}
          {o.perfect &&
            (report.perfectCount > 0 ? (
              <Tile
                label="100점 수"
                value={`${report.perfectCount}명`}
                sub={bdSub(report, (es) => `${es.perfectCount}`)}
              />
            ) : (
              <Tile
                label="100점 수"
                value="0명"
                sub={`최고점 ${report.maxScore}점 · ${report.maxScoreCount}명`}
              />
            ))}
          {o.top30 && (
            <Tile label="상위 30% 평균" value={`${report.top30Mean}`} sub={`상위 ${report.top30N}명`} />
          )}
        </div>

        {o.perfect && <PerfectNames report={report} />}

        <div className="section-title">
          정답률 {report.options.lowAccuracyThreshold}% 미만 문제
        </div>
        {report.lowAccuracy.length ? (
          <table className="wide">
            <thead>
              <tr>
                <th>문항</th>
                <th>전체</th>
                {report.breakdown &&
                  report.electivesPresent.map((e) => <th key={e}>{shortLabel(e)}</th>)}
                <th>정답 인원</th>
              </tr>
            </thead>
            <tbody>
              {report.lowAccuracy.map((q) => (
                <tr key={q.label}>
                  <td className="q">
                    {q.label}
                    {q.electiveTag ? ` (${q.electiveTag})` : ""}
                  </td>
                  <td>{q.correctRate}%</td>
                  {report.breakdown &&
                    report.electivesPresent.map((e) => {
                      const v = q.perElective?.[e];
                      return <td key={e}>{v === null || v === undefined ? "-" : `${v}%`}</td>;
                    })}
                  <td>
                    {q.correctCount}/{q.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="hint">해당 기준 미만의 문항이 없습니다.</p>
        )}

        {showConv && (
          <>
            <div className="section-title">원점수 환산표</div>
            <table className="wide">
              <thead>
                <tr>
                  <th>원점수</th>
                  {o.standardScore && <th>표준점수</th>}
                  {o.percentile && <th>백분위</th>}
                  {o.grade && <th>등급</th>}
                </tr>
              </thead>
              <tbody>
                {report.conversion.map((r) => (
                  <tr key={r.rawScore}>
                    <td>{r.rawScore}</td>
                    {o.standardScore && <td>{r.standardScore}</td>}
                    {o.percentile && <td>{r.percentile}</td>}
                    {o.grade && <td>{r.grade}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    );
  }
);

const SHORT: Record<number, string> = { 1: "확통", 2: "미적", 3: "기하" };
function shortLabel(e: number) {
  return SHORT[e] ?? String(e);
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      {sub ? <div className="tile-sub">{sub}</div> : null}
    </div>
  );
}

/** 100점(만점) 학생 명단. 만점자가 없으면 최고점 학생 명단을 보여준다. */
function PerfectNames({ report }: { report: StatReport }) {
  const hasPerfect = report.perfectCount > 0;
  const title = hasPerfect ? "100점 명단" : `최고점(${report.maxScore}점) 명단`;

  if (report.breakdown && hasPerfect) {
    const groups = report.electiveStats.filter((es) => es.perfectNames.length > 0);
    if (!groups.length) return null;
    return (
      <div className="names">
        <div className="names-title">{title}</div>
        {groups.map((es) => (
          <div className="names-row" key={es.elective}>
            <span className="names-tag">{es.short}</span>
            <span className="names-list">{es.perfectNames.join(", ")}</span>
          </div>
        ))}
      </div>
    );
  }

  const names = hasPerfect ? report.perfectNames : report.maxScoreNames;
  if (!names.length) return null;
  return (
    <div className="names">
      <div className="names-title">{title}</div>
      <div className="names-list">{names.join(", ")}</div>
    </div>
  );
}

export default ReportView;
