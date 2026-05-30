import { forwardRef } from "react";
import type { StatReport } from "@/lib/stats";

const ReportView = forwardRef<HTMLDivElement, { report: StatReport }>(
  function ReportView({ report }, ref) {
    const o = report.options.selected;
    const showConv = o.percentile || o.standardScore || o.grade;
    const analyzed = report.count;

    return (
      <div className="report" ref={ref}>
        <h2>{report.examName} 통계 자료</h2>
        <div className="meta">
          분석 대상 {analyzed}명
          {report.removedCount > 0 && ` · 허수 ${report.removedCount}명 제거`}
          {report.ungradedCount > 0 && ` · 미산출 ${report.ungradedCount}명 제외`}
        </div>

        <div className="section-title">시험 통계</div>
        <div className="kv">
          {o.count && <KV k="응시자수" v={`${report.count}명`} />}
          {o.mean && <KV k="평균" v={`${report.mean}`} />}
          {o.stdev && <KV k="표준편차" v={`${report.stdev}`} />}
          {o.perfect &&
            (report.perfectCount > 0 ? (
              <KV k="100점 수" v={`${report.perfectCount}명`} />
            ) : (
              <KV
                k="100점 수"
                v={`0명 (최고점 ${report.maxScore}점 · ${report.maxScoreCount}명)`}
              />
            ))}
          {o.top30 && <KV k="상위 30% 평균" v={`${report.top30Mean} (${report.top30N}명)`} />}
        </div>

        <div className="cols">
          <div>
            <div className="section-title">
              정답률 {report.options.lowAccuracyThreshold}% 미만 문제
            </div>
            {report.lowAccuracy.length ? (
              <table>
                <thead>
                  <tr>
                    <th>문항</th>
                    <th>정답률</th>
                    <th>정답 인원</th>
                  </tr>
                </thead>
                <tbody>
                  {report.lowAccuracy.map((q) => (
                    <tr key={q.label}>
                      <td>{q.label}</td>
                      <td>{q.correctRate}%</td>
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
          </div>

          {showConv && (
            <div>
              <div className="section-title">원점수 환산표</div>
              <div className="conv-scroll">
                <table>
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
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="row">
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}

export default ReportView;
