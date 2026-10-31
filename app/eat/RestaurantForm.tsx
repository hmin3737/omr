"use client";

import { useState, type FormEvent } from "react";
import {
  DAY_LABELS,
  MEALS,
  emptyRestaurantInput,
  type FoodCategory,
  type Restaurant,
  type RestaurantInput,
} from "@/lib/eat";
import { createCategory, createRestaurant, updateRestaurant } from "@/lib/eat-client";

const AUTHOR_KEY = "eat-author";

interface FormState extends Omit<RestaurantInput, "pricePerPerson" | "minOrder" | "menus"> {
  pricePerPerson: string;
  minOrder: string;
  menus: { name: string; price: string }[];
}

function toForm(r: RestaurantInput): FormState {
  return {
    ...r,
    pricePerPerson: r.pricePerPerson ? String(r.pricePerPerson) : "",
    minOrder: r.minOrder ? String(r.minOrder) : "",
    menus: r.menus.map((m) => ({ name: m.name, price: m.price ? String(m.price) : "" })),
  };
}

function fromForm(f: FormState): RestaurantInput {
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/[^\d]/g, "")) || null);
  return {
    ...f,
    pricePerPerson: num(f.pricePerPerson),
    minOrder: num(f.minOrder),
    menus: f.menus
      .filter((m) => m.name.trim())
      .map((m) => ({ name: m.name.trim(), price: num(m.price) ?? 0 })),
  };
}

function loadAuthor(): string {
  try {
    return localStorage.getItem(AUTHOR_KEY) ?? "";
  } catch {
    return "";
  }
}

function toggleIn<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export default function RestaurantForm({
  editing,
  admin,
  categories,
  onCategoryAdded,
  onSaved,
  onClose,
}: {
  editing: Restaurant | null;
  admin: boolean;
  categories: FoodCategory[];
  onCategoryAdded: (c: FoodCategory) => void;
  onSaved: (r: Restaurant) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(() =>
    toForm(
      editing ?? { ...emptyRestaurantInput(), createdBy: loadAuthor(), recommended: admin }
    )
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newCat, setNewCat] = useState("");
  const [catBusy, setCatBusy] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function setMenu(i: number, patch: Partial<{ name: string; price: string }>) {
    setForm((f) => ({ ...f, menus: f.menus.map((m, k) => (k === i ? { ...m, ...patch } : m)) }));
  }

  // 새 종류를 만들고 바로 이 가게에 선택해 둔다
  async function addCategory() {
    const name = newCat.trim();
    if (!name) return;
    const existing = categories.find((c) => c.name === name);
    if (existing) {
      if (!form.categories.includes(name)) set("categories", [...form.categories, name]);
      setNewCat("");
      return;
    }
    setError("");
    setCatBusy(true);
    try {
      const created = await createCategory(name);
      onCategoryAdded(created);
      setForm((f) => ({ ...f, categories: [...f.categories, created.name] }));
      setNewCat("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "종류 추가 실패");
    } finally {
      setCatBusy(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const input = fromForm(form);
      const saved = editing ? await updateRestaurant(editing.id, input) : await createRestaurant(input);
      try {
        if (input.createdBy) localStorage.setItem(AUTHOR_KEY, input.createdBy);
      } catch {
        /* ignore */
      }
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal eat-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-head">
          <h2>{editing ? "가게 정보 수정" : "가게 등록"}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label className="lab">
              가게 이름 <span className="req">*</span>
            </label>
            <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus />
          </div>

          <div className="field">
            <label className="lab">배민 링크</label>
            <input
              type="url"
              value={form.baeminUrl}
              onChange={(e) => set("baeminUrl", e.target.value)}
              placeholder="https://..."
            />
            <p className="hint">배민 앱 가게 화면 → 공유 → 링크 복사 후 붙여넣기</p>
          </div>

          <div className="field">
            <label className="lab">음식 종류</label>
            <div className="eat-chips">
              {categories.map(({ name: c }) => (
                <button
                  type="button"
                  key={c}
                  className={form.categories.includes(c) ? "eat-chip on" : "eat-chip"}
                  onClick={() => set("categories", toggleIn(form.categories, c))}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="eat-cat-add">
              <input
                type="text"
                value={newCat}
                maxLength={20}
                onChange={(e) => setNewCat(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCategory();
                  }
                }}
                placeholder="원하는 종류가 없으면 새로 추가"
              />
              <button type="button" className="btn-mini" disabled={!newCat.trim() || catBusy} onClick={addCategory}>
                {catBusy ? "..." : "+ 추가"}
              </button>
            </div>
          </div>

          <div className="field">
            <label className="lab">주로 시키는 끼니</label>
            <div className="eat-chips">
              {MEALS.map((m) => (
                <button
                  type="button"
                  key={m.key}
                  className={form.meals.includes(m.key) ? "eat-chip on" : "eat-chip"}
                  onClick={() => set("meals", toggleIn(form.meals, m.key as string))}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="lab">배달 주문 가능 시간</label>
            <div className="eat-time-row">
              <input type="time" value={form.openTime} onChange={(e) => set("openTime", e.target.value)} />
              <span>~</span>
              <input type="time" value={form.closeTime} onChange={(e) => set("closeTime", e.target.value)} />
            </div>
            <p className="hint">마감이 시작보다 이르면 자정을 넘겨 영업하는 것으로 봅니다.</p>
          </div>

          <div className="field">
            <label className="lab">브레이크 타임 (선택)</label>
            <div className="eat-time-row">
              <input type="time" value={form.breakStart} onChange={(e) => set("breakStart", e.target.value)} />
              <span>~</span>
              <input type="time" value={form.breakEnd} onChange={(e) => set("breakEnd", e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label className="lab">휴무 요일</label>
            <div className="eat-chips">
              {DAY_LABELS.map((d, i) => (
                <button
                  type="button"
                  key={d}
                  className={form.closedDays.includes(i) ? "eat-chip on" : "eat-chip"}
                  onClick={() => set("closedDays", toggleIn(form.closedDays, i))}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="field checks">
            <label className="check">
              <input
                type="checkbox"
                checked={form.meetPayment}
                onChange={(e) => set("meetPayment", e.target.checked)}
              />
              만나서 카드결제 가능
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={form.storeDelivery}
                onChange={(e) => set("storeDelivery", e.target.checked)}
              />
              가게배달
            </label>
          </div>

          <div className="eat-two">
            <div className="field">
              <label className="lab">인당 예상 금액</label>
              <input
                type="text"
                inputMode="numeric"
                value={form.pricePerPerson}
                onChange={(e) => set("pricePerPerson", e.target.value)}
                placeholder="예: 12000"
              />
              <p className="hint">비우면 메뉴 가격으로 추정</p>
            </div>
            <div className="field">
              <label className="lab">최소주문금액</label>
              <input
                type="text"
                inputMode="numeric"
                value={form.minOrder}
                onChange={(e) => set("minOrder", e.target.value)}
                placeholder="예: 15000"
              />
            </div>
          </div>

          <div className="field">
            <label className="lab">대표 메뉴</label>
            {form.menus.map((m, i) => (
              <div className="eat-menu-row" key={i}>
                <input
                  type="text"
                  value={m.name}
                  onChange={(e) => setMenu(i, { name: e.target.value })}
                  placeholder="메뉴 이름"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  value={m.price}
                  onChange={(e) => setMenu(i, { price: e.target.value })}
                  placeholder="가격"
                />
                <button
                  type="button"
                  className="btn-mini"
                  onClick={() => set("menus", form.menus.filter((_, k) => k !== i))}
                  aria-label="메뉴 삭제"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn-mini"
              onClick={() => set("menus", [...form.menus, { name: "", price: "" }])}
            >
              + 메뉴 추가
            </button>
          </div>

          <div className="field">
            <label className="lab">메모</label>
            <textarea
              rows={3}
              value={form.memo}
              onChange={(e) => set("memo", e.target.value)}
              placeholder="예: 제육 양 많음, 11시 반 전에 시켜야 12시 도착"
            />
          </div>

          <div className="field">
            <label className="lab">등록한 사람 (선택)</label>
            <input type="text" value={form.createdBy} onChange={(e) => set("createdBy", e.target.value)} />
          </div>

          {admin && (
            <label className="check field">
              <input
                type="checkbox"
                checked={form.recommended}
                onChange={(e) => set("recommended", e.target.checked)}
              />
              추천 가게로 표시
            </label>
          )}

          {error && <div className="error">{error}</div>}
          <div className="btn-row">
            <button type="button" className="btn secondary" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="btn" disabled={busy || !form.name.trim()}>
              {busy ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
