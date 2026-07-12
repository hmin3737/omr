"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/parse";
import { computeReport } from "@/lib/stats";
import { fetchExamFile, listClasses, listExams, type ClassGroup, type SavedExam } from "@/lib/store";

interface Point {
  examName: string;
  classId: string;
  mean: number;
}

function parseNum(v: string): number | null {
  const n = Number(v);
  return v.trim() === "" || Number.isNaN(n) ? null : n;
}

export default function TrendsPage() {
  const [classes, setClasses] = useState<ClassGroup[]>([]);
  const [exams, setExams] = useState<SavedExam[]>([]);
  const [points, setPoints] = useState<Point[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [cls, exs] = await Promise.all([listClasses(), listExams()]);
        setClasses(cls);
        setExams(exs);
        setSelected(new Set(cls.map((c) => c.id)));

        // 반이 지정된 시험만 대상으로 평균 계산 (저장된 설정 사용)
        const withClass = exs.filter((e) => e.classId);
        const computed = await Promise.all(
          withClass.map(async (ex) => {
            try {
              const f = await fetchExamFile(ex);
              const parsed = await parseFile(f, ex.name);
              const rep = computeReport(parsed, {
                cutoff: parseNum(ex.settings.cutoff),
                selected: ex.settings.selected,
                lowAccuracyThreshold: Number(ex.settings.lowThreshold) || 0,
                electiveStart: parseNum(ex.settings.electiveStart ?? "23"),
              });
              if (rep.count === 0) return null;
              return { examName: ex.name, classId: ex.classId as string, mean: rep.mean };
            } catch {
              return null;
            }
          })
        );
        setPoints(computed.filter((p): p is Point => p !== null));
      } catch (e) {
        setError(e instanceof Error ? e.message : "불러오기 실패");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 같은 (반, 시험이름)이 여러 개면 평균
  const seriesByClass = useMemo(() => {
    const map = new Map<string, Map<string, number[]>>();
    for (const p of points) {
      if (!map.has(p.classId)) map.set(p.classId, new Map());
      const inner = map.get(p.classId)!;
      if (!inner.has(p.examName)) inner.set(p.examName, []);
      inner.get(p.examName)!.push(p.mean);
    }
    return map;
  }, [points]);

  // x축: 시험 이름 목록 (가장 이른 생성 시각 순)
  const examOrder = useMemo(() => {
    const earliest = new Map<string, number>();
    for (const ex of exams) {
      if (!ex.classId) continue;
      const cur = earliest.get(ex.name);
      if (cur === undefined || ex.createdAt < cur) earliest.set(ex.name, ex.createdAt);
    }
    return Array.from(earliest.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([name]) => name);
  }, [exams]);

  const shownClasses = classes.filter((c) => selected.has(c.id) && seriesByClass.has(c.id));

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="wrap">
      <div className="trends-head">
        <h1>반별 시험 평균 추세</h1>
        <Link href="/" className="banner-btn ghost">
          ← 통계 생성기로
        </Link>
      </div>
      <p className="sub">
        같은 시험 이름을 기준으로 각 반의 평균 변화를 겹쳐서 비교합니다. 반이 지정된 시험만 표시됩니다.
      </p>

      {loading ? (
        <div className="report">
          <p className="placeholder">평균을 계산하는 중입니다…</p>
        </div>
      ) : error ? (
        <div className="error">{error}</div>
      ) : examOrder.length === 0 || shownClasses.length === 0 ? (
        <div className="report">
          <p className="placeholder">
            표시할 데이터가 없습니다. 시험에 반을 지정하고 저장하면 여기에 추세가 나타납니다.
          </p>
        </div>
      ) : (
        <>
          <div className="legend">
            {classes
              .filter((c) => seriesByClass.has(c.id))
              .map((c) => (
                <button
                  key={c.id}
                  className={selected.has(c.id) ? "legend-item" : "legend-item off"}
                  onClick={() => toggle(c.id)}
                >
                  <span className="legend-dot" style={{ background: c.color }} />
                  {c.name}
                </button>
              ))}
          </div>
          <TrendChart classes={shownClasses} examOrder={examOrder} seriesByClass={seriesByClass} />
        </>
      )}
    </div>
  );
}

function TrendChart({
  classes,
  examOrder,
  seriesByClass,
}: {
  classes: ClassGroup[];
  examOrder: string[];
  seriesByClass: Map<string, Map<string, number[]>>;
}) {
  const W = 760;
  const H = 400;
  const m = { top: 20, right: 96, bottom: 64, left: 44 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  // y 도메인: 데이터 최소/최대에 여유
  const allMeans: number[] = [];
  for (const c of classes) {
    const inner = seriesByClass.get(c.id);
    if (!inner) continue;
    for (const name of examOrder) {
      const arr = inner.get(name);
      if (arr) allMeans.push(arr.reduce((a, b) => a + b, 0) / arr.length);
    }
  }
  const dMin = Math.max(0, Math.floor((Math.min(...allMeans) - 5) / 5) * 5);
  const dMax = Math.min(100, Math.ceil((Math.max(...allMeans) + 5) / 5) * 5);
  const span = dMax - dMin || 1;

  const x = (i: number) =>
    m.left + (examOrder.length === 1 ? iw / 2 : (i / (examOrder.length - 1)) * iw);
  const y = (v: number) => m.top + ih - ((v - dMin) / span) * ih;

  const yTicks: number[] = [];
  for (let v = dMin; v <= dMax; v += Math.max(5, Math.round(span / 5 / 5) * 5)) yTicks.push(v);

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img">
        {/* y 그리드 + 눈금 */}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={m.left} y1={y(v)} x2={W - m.right} y2={y(v)} className="grid" />
            <text x={m.left - 8} y={y(v)} className="tick" textAnchor="end" dominantBaseline="middle">
              {v}
            </text>
          </g>
        ))}

        {/* x 라벨 */}
        {examOrder.map((name, i) => (
          <text key={name} x={x(i)} y={H - m.bottom + 20} className="tick" textAnchor="middle">
            {name.length > 8 ? name.slice(0, 7) + "…" : name}
          </text>
        ))}

        {/* 반별 라인 */}
        {classes.map((c) => {
          const inner = seriesByClass.get(c.id);
          if (!inner) return null;
          const pts = examOrder
            .map((name, i) => {
              const arr = inner.get(name);
              if (!arr) return null;
              const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
              return { i, x: x(i), y: y(mean), mean, name };
            })
            .filter((p): p is { i: number; x: number; y: number; mean: number; name: string } => p !== null);
          if (!pts.length) return null;
          const d = pts.map((p, k) => `${k === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
          const last = pts[pts.length - 1];
          return (
            <g key={c.id}>
              <path d={d} fill="none" stroke={c.color} strokeWidth={2} />
              {pts.map((p) => (
                <circle key={p.i} cx={p.x} cy={p.y} r={4} fill={c.color}>
                  <title>
                    {c.name} · {p.name}: {p.mean.toFixed(1)}
                  </title>
                </circle>
              ))}
              <text x={last.x + 8} y={last.y} className="line-label" fill={c.color} dominantBaseline="middle">
                {c.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
