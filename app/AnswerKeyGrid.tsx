"use client";

import { useEffect, useMemo, useState } from "react";
import {
  resizeAnswerKey,
  type AnswerKeyPayload,
  type Elective,
  type QuestionType,
} from "@/lib/rawAnswers";
import {
  deleteAnswerKeyTemplate,
  listAnswerKeyTemplates,
  loadAnswerKeyTemplate,
  saveAnswerKeyTemplate,
  type AnswerKeyTemplateMeta,
} from "@/lib/store";

const ELECTIVE_LABEL: Record<Elective, string> = { 1: "확통", 2: "미적", 3: "기하" };

export default function AnswerKeyGrid({
  value,
  onChange,
  templateName,
  onTemplateNameChange,
}: {
  value: AnswerKeyPayload;
  onChange: (next: AnswerKeyPayload) => void;
  templateName: string;
  onTemplateNameChange: (name: string) => void;
}) {
  const [templates, setTemplates] = useState<AnswerKeyTemplateMeta[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    listAnswerKeyTemplates()
      .then(setTemplates)
      .catch(() => {});
  }, []);

  const totalPoints = useMemo(
    () => value.questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0),
    [value.questions]
  );

  function updateConfig(questionCount: number, electiveStart: number) {
    onChange(resizeAnswerKey(value, questionCount, electiveStart));
  }

  function updateQuestion(number: number, patch: Partial<AnswerKeyPayload["questions"][number]>) {
    onChange({
      ...value,
      questions: value.questions.map((q) => (q.number === number ? { ...q, ...patch } : q)),
    });
  }

  // 정답 입력 칸에서 ↓/↑ 로 바로 다음/이전 문항의 같은 칸(공통 정답 또는 같은 선택과목)으로 이동
  function handleAnswerArrowKey(e: React.KeyboardEvent<HTMLInputElement>, number: number, col: "c" | Elective) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const targetNumber = number + (e.key === "ArrowDown" ? 1 : -1);
    const target = value.questions.find((q) => q.number === targetNumber);
    if (!target) return;
    const targetCol: "c" | Elective = targetNumber < value.electiveStart ? "c" : col === "c" ? 1 : col;
    const el = document.getElementById(`answer-${targetNumber}-${targetCol}`) as HTMLInputElement | null;
    el?.focus();
    el?.select();
  }

  async function handleLoadTemplate(id: string, name: string) {
    setBusy(true);
    setNotice("");
    try {
      const payload = await loadAnswerKeyTemplate(id);
      onChange(payload);
      onTemplateNameChange(name);
      setShowPicker(false);
      setNotice(`"${name}" 템플릿을 불러왔습니다.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "템플릿을 불러오지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveTemplate() {
    if (!templateName.trim()) {
      setNotice("템플릿 이름을 입력하세요.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      await saveAnswerKeyTemplate(templateName.trim(), value);
      setTemplates(await listAnswerKeyTemplates());
      setNotice(`"${templateName.trim()}" 이름으로 저장했습니다.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "템플릿 저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteTemplate(t: AnswerKeyTemplateMeta) {
    if (!window.confirm(`"${t.name}" 템플릿을 삭제할까요?`)) return;
    await deleteAnswerKeyTemplate(t.id);
    setTemplates(await listAnswerKeyTemplates());
  }

  return (
    <div className="answer-key">
      <div className="answer-key-config">
        <label className="field-inline">
          총 문항 수
          <input
            type="number"
            min={1}
            value={value.questionCount}
            onChange={(e) => updateConfig(Number(e.target.value) || 1, value.electiveStart)}
          />
        </label>
        <label className="field-inline">
          선택과목 시작 번호
          <input
            type="number"
            min={1}
            value={value.electiveStart}
            onChange={(e) => updateConfig(value.questionCount, Number(e.target.value) || 1)}
          />
        </label>
        <span className={totalPoints === 100 ? "points-ok" : "points-warn"}>배점 합계 {totalPoints}점</span>
      </div>

      <div className="template-row">
        <input
          type="text"
          value={templateName}
          onChange={(e) => onTemplateNameChange(e.target.value)}
          placeholder='정답 템플릿 이름 (예: "서바8회")'
        />
        <button type="button" className="btn-mini" onClick={() => setShowPicker((v) => !v)}>
          불러오기
        </button>
        <button type="button" className="btn-mini" onClick={handleSaveTemplate} disabled={busy}>
          템플릿으로 저장
        </button>
      </div>
      {showPicker && (
        <div className="template-picker">
          {templates.length === 0 ? (
            <p className="hint">저장된 템플릿이 없습니다.</p>
          ) : (
            <ul>
              {templates.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => handleLoadTemplate(t.id, t.name)}>
                    {t.name}
                  </button>
                  <button type="button" className="danger" onClick={() => handleDeleteTemplate(t)}>
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {notice && <p className="hint">{notice}</p>}

      <div className="answer-grid-scroll">
        <table className="answer-grid">
          <thead>
            <tr>
              <th>번호</th>
              <th>유형</th>
              <th>배점</th>
              <th>정답</th>
            </tr>
          </thead>
          <tbody>
            {value.questions.map((q) => (
              <tr key={q.number}>
                <td>{q.number}</td>
                <td>
                  <select
                    value={q.type}
                    onChange={(e) => updateQuestion(q.number, { type: e.target.value as QuestionType })}
                  >
                    <option value="objective">객관식</option>
                    <option value="short">단답형</option>
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    className="points-input"
                    value={q.points}
                    onChange={(e) => updateQuestion(q.number, { points: Number(e.target.value) || 0 })}
                  />
                </td>
                <td>
                  {q.number < value.electiveStart ? (
                    <input
                      type="text"
                      id={`answer-${q.number}-c`}
                      className="answer-input"
                      value={q.answer}
                      onChange={(e) => updateQuestion(q.number, { answer: e.target.value })}
                      onKeyDown={(e) => handleAnswerArrowKey(e, q.number, "c")}
                    />
                  ) : (
                    <div className="elective-answers">
                      {([1, 2, 3] as Elective[]).map((e) => (
                        <label key={e} className="elective-answer">
                          {ELECTIVE_LABEL[e]}
                          <input
                            type="text"
                            id={`answer-${q.number}-${e}`}
                            className="answer-input"
                            value={q.answers[e]}
                            onChange={(ev) =>
                              updateQuestion(q.number, { answers: { ...q.answers, [e]: ev.target.value } })
                            }
                            onKeyDown={(ev) => handleAnswerArrowKey(ev, q.number, e)}
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
