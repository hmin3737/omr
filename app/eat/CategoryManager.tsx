"use client";

import { useState, type FormEvent } from "react";
import type { FoodCategory } from "@/lib/eat";
import { createCategory, deleteCategory, renameCategory } from "@/lib/eat-client";

/** 음식 종류 추가·이름 변경(누구나), 삭제(실장만) */
export default function CategoryManager({
  categories,
  admin,
  onChanged,
  onClose,
}: {
  categories: FoodCategory[];
  admin: boolean;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function run(id: string, fn: () => Promise<unknown>) {
    setError("");
    setBusyId(id);
    try {
      await fn();
      await onChanged();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리 실패");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function handleRename(c: FoodCategory) {
    const name = (drafts[c.id] ?? c.name).trim();
    if (!name || name === c.name) return;
    const ok = await run(c.id, () => renameCategory(c.id, name));
    if (ok)
      setDrafts((d) => {
        const { [c.id]: _, ...rest } = d;
        return rest;
      });
  }

  async function handleDelete(c: FoodCategory) {
    if (!confirm(`'${c.name}' 종류를 삭제할까요? 이 종류가 붙은 가게에서도 빠집니다.`)) return;
    await run(c.id, () => deleteCategory(c.id));
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    if (await run("new", () => createCategory(name))) setNewName("");
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal eat-form" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>음식 종류 편집</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="hint eat-cat-hint">
            이름을 바꾸면 그 종류가 붙은 가게들도 함께 바뀝니다.{admin ? "" : " 삭제는 실장만 할 수 있습니다."}
          </p>
          <ul className="eat-cat-list">
            {categories.map((c) => {
              const draft = drafts[c.id] ?? c.name;
              const changed = draft.trim() !== c.name && draft.trim() !== "";
              return (
                <li key={c.id}>
                  <input
                    type="text"
                    value={draft}
                    maxLength={20}
                    onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(c);
                    }}
                  />
                  <button
                    type="button"
                    className="btn-mini"
                    disabled={!changed || busyId !== null}
                    onClick={() => handleRename(c)}
                  >
                    {busyId === c.id ? "..." : "저장"}
                  </button>
                  {admin && (
                    <button
                      type="button"
                      className="btn-mini eat-danger"
                      disabled={busyId !== null}
                      onClick={() => handleDelete(c)}
                    >
                      삭제
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <form className="eat-cat-add" onSubmit={handleAdd}>
            <input
              type="text"
              value={newName}
              maxLength={20}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="새 종류 이름 (예: 마라탕)"
            />
            <button type="submit" className="btn-mini" disabled={!newName.trim() || busyId !== null}>
              {busyId === "new" ? "..." : "+ 추가"}
            </button>
          </form>
          {error && <div className="error">{error}</div>}
        </div>
      </div>
    </div>
  );
}
