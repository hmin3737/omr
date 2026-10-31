"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  DAY_LABELS,
  DEFAULT_BUDGET,
  MEALS,
  currentMeal,
  formatWon,
  isOpenAt,
  kstNow,
  meetsOrderRules,
  perPersonPrice,
  type KstNow,
  type FoodCategory,
  type MealKey,
  type Restaurant,
} from "@/lib/eat";
import {
  adminLogin,
  adminLogout,
  deleteRestaurant,
  getAdminStatus,
  likeRestaurant,
  listCategories,
  updateRestaurant,
  listRestaurants,
  markOrdered,
} from "@/lib/eat-client";
import RestaurantForm from "./RestaurantForm";
import CategoryManager from "./CategoryManager";

const LIKED_KEY = "eat-liked";
const RECENT_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

function loadLiked(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(LIKED_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

function saveLiked(s: Set<string>) {
  try {
    localStorage.setItem(LIKED_KEY, JSON.stringify(Array.from(s)));
  } catch {
    /* ignore */
  }
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
}

/** 랜덤 뽑기 가중치: 추천·좋아요는 더 자주, 최근 주문한 곳은 덜 자주 */
function pickWeight(r: Restaurant): number {
  const recent = daysSince(r.lastOrderedAt);
  return (
    (r.recommended ? 2 : 1) *
    (1 + Math.min(r.likes, 10) * 0.1) *
    (recent !== null && recent < RECENT_DAYS ? 0.25 : 1)
  );
}

function weightedPick(list: Restaurant[], excludeId: string | null): Restaurant | null {
  const pool = list.length > 1 ? list.filter((r) => r.id !== excludeId) : list;
  const total = pool.reduce((s, r) => s + pickWeight(r), 0);
  let x = Math.random() * total;
  for (const r of pool) {
    x -= pickWeight(r);
    if (x <= 0) return r;
  }
  return pool[pool.length - 1] ?? null;
}

export default function EatPage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [categories, setCategories] = useState<FoodCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [admin, setAdmin] = useState(false);
  const [now, setNow] = useState<KstNow | null>(null);
  const [liked, setLiked] = useState<Set<string>>(new Set());

  const [meal, setMeal] = useState<MealKey | "all">("all");
  const [cats, setCats] = useState<Set<string>>(new Set());
  const [budget, setBudget] = useState(String(DEFAULT_BUDGET));
  const [openOnly, setOpenOnly] = useState(true);
  const [rulesOnly, setRulesOnly] = useState(true);
  const [recOnly, setRecOnly] = useState(false);
  const [query, setQuery] = useState("");

  const [pickedId, setPickedId] = useState<string | null>(null);
  const [formFor, setFormFor] = useState<Restaurant | "new" | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [catsOpen, setCatsOpen] = useState(false);
  const pickRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const n = kstNow();
    setNow(n);
    setMeal(currentMeal(n));
    setLiked(loadLiked());
    const timer = setInterval(() => setNow(kstNow()), 60_000);

    (async () => {
      try {
        const [list, cats, status] = await Promise.all([
          listRestaurants(),
          listCategories(),
          getAdminStatus(),
        ]);
        setRestaurants(list);
        setCategories(cats);
        setAdmin(status.admin);
      } catch (e) {
        setError(e instanceof Error ? e.message : "불러오기 실패");
      } finally {
        setLoading(false);
      }
    })();
    return () => clearInterval(timer);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const maxPrice = Number(budget) || null;
    const openRank = (r: Restaurant) => {
      const open = now ? isOpenAt(r, now) : null;
      return open === true ? 0 : open === null ? 1 : 2;
    };
    return restaurants
      .filter((r) => {
        if (q) {
          const hay = [r.name, r.memo, ...r.menus.map((m) => m.name)].join(" ").toLowerCase();
          if (!hay.includes(q)) return false;
        }
        // 끼니가 지정되지 않은 가게는 모든 끼니에 포함
        if (meal !== "all" && r.meals.length && !r.meals.includes(meal)) return false;
        if (cats.size && !r.categories.some((c) => cats.has(c))) return false;
        const price = perPersonPrice(r);
        if (maxPrice && price !== null && price > maxPrice) return false;
        if (openOnly && now && isOpenAt(r, now) === false) return false;
        if (rulesOnly && !meetsOrderRules(r)) return false;
        if (recOnly && !r.recommended) return false;
        return true;
      })
      .sort(
        (a, b) =>
          Number(b.recommended) - Number(a.recommended) ||
          openRank(a) - openRank(b) ||
          b.likes - a.likes ||
          a.name.localeCompare(b.name, "ko")
      );
  }, [restaurants, query, meal, cats, budget, openOnly, rulesOnly, recOnly, now]);

  const picked = restaurants.find((r) => r.id === pickedId) ?? null;

  function pick() {
    const r = weightedPick(filtered, pickedId);
    setPickedId(r?.id ?? null);
    requestAnimationFrame(() => pickRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  // 종류 이름 변경·삭제는 가게들의 종류에도 반영되므로 둘 다 다시 불러온다
  async function reloadCategories() {
    const [cats, list] = await Promise.all([listCategories(), listRestaurants()]);
    setCategories(cats);
    setRestaurants(list);
    const names = new Set(cats.map((c) => c.name));
    setCats((s) => new Set(Array.from(s).filter((c) => names.has(c))));
  }

  function replace(r: Restaurant) {
    setRestaurants((list) => {
      const exists = list.some((x) => x.id === r.id);
      return exists ? list.map((x) => (x.id === r.id ? r : x)) : [...list, r];
    });
  }

  function patch(id: string, p: Partial<Restaurant>) {
    setRestaurants((list) => list.map((x) => (x.id === id ? { ...x, ...p } : x)));
  }

  async function handleLike(r: Restaurant) {
    if (liked.has(r.id)) return;
    try {
      const { likes } = await likeRestaurant(r.id);
      patch(r.id, { likes });
      const next = new Set(liked).add(r.id);
      setLiked(next);
      saveLiked(next);
    } catch (e) {
      alert(e instanceof Error ? e.message : "처리 실패");
    }
  }

  async function handleOrdered(r: Restaurant) {
    try {
      const { lastOrderedAt } = await markOrdered(r.id);
      patch(r.id, { lastOrderedAt });
    } catch (e) {
      alert(e instanceof Error ? e.message : "처리 실패");
    }
  }

  async function handleDelete(r: Restaurant) {
    if (!confirm(`'${r.name}'을(를) 삭제할까요?`)) return;
    try {
      await deleteRestaurant(r.id);
      setRestaurants((list) => list.filter((x) => x.id !== r.id));
      if (pickedId === r.id) setPickedId(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 실패");
    }
  }

  async function handleToggleRecommend(r: Restaurant) {
    try {
      replace(await updateRestaurant(r.id, { ...r, recommended: !r.recommended }));
    } catch (e) {
      alert(e instanceof Error ? e.message : "처리 실패");
    }
  }

  async function handleLogout() {
    await adminLogout().catch(() => null);
    setAdmin(false);
  }

  const cardProps = (r: Restaurant) => ({
    r,
    now,
    admin,
    budget: Number(budget) || null,
    liked: liked.has(r.id),
    onLike: () => handleLike(r),
    onOrdered: () => handleOrdered(r),
    onEdit: () => setFormFor(r),
    onDelete: () => handleDelete(r),
    onToggleRecommend: () => handleToggleRecommend(r),
  });

  return (
    <div className="wrap eat">
      <div className="eat-head">
        <div>
          <h1>밥</h1>
        </div>
        <div className="eat-head-actions">
          <button className="eat-btn primary" onClick={() => setFormFor("new")}>
            + 가게 등록
          </button>
          {admin ? (
            <button className="eat-btn" onClick={handleLogout}>
              실장 로그아웃
            </button>
          ) : (
            <button className="eat-btn ghost" onClick={() => setAdminOpen(true)}>
              실장
            </button>
          )}
        </div>
      </div>

      <div className="card eat-filters">
        <div className="eat-filter-row">
          <span className="eat-filter-label">끼니</span>
          <div className="eat-chips">
            {[{ key: "all", label: "전체" } as const, ...MEALS].map((m) => (
              <button
                key={m.key}
                className={meal === m.key ? "eat-chip on" : "eat-chip"}
                onClick={() => setMeal(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="eat-filter-row">
          <span className="eat-filter-label">종류</span>
          <div className="eat-chips">
            {categories.map(({ name: c }) => (
              <button
                key={c}
                className={cats.has(c) ? "eat-chip on" : "eat-chip"}
                onClick={() =>
                  setCats((s) => {
                    const next = new Set(s);
                    if (next.has(c)) next.delete(c);
                    else next.add(c);
                    return next;
                  })
                }
              >
                {c}
              </button>
            ))}
            {cats.size > 0 && (
              <button className="link-btn eat-clear" onClick={() => setCats(new Set())}>
                선택 해제
              </button>
            )}
            <button className="link-btn eat-clear" onClick={() => setCatsOpen(true)}>
              종류 편집
            </button>
          </div>
        </div>
        <div className="eat-filter-row">
          <span className="eat-filter-label">인당</span>
          <div className="eat-budget">
            <input
              type="text"
              inputMode="numeric"
              value={budget}
              onChange={(e) => setBudget(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="제한 없음"
            />
            <span>원 이하</span>
          </div>
          <input
            className="eat-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="가게·메뉴 검색"
          />
        </div>
        <div className="eat-toggles">
          <label className="check">
            <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
            지금 주문 가능
          </label>
          <label className="check">
            <input type="checkbox" checked={rulesOnly} onChange={(e) => setRulesOnly(e.target.checked)} />
            만나서결제·가게배달만
          </label>
          <label className="check">
            <input type="checkbox" checked={recOnly} onChange={(e) => setRecOnly(e.target.checked)} />
            추천만
          </label>
        </div>
        <button className="btn eat-pick-btn" onClick={pick} disabled={!filtered.length}>
          🎲 {picked ? "다시 뽑기" : "랜덤으로 뽑기"} <span className="eat-pick-count">({filtered.length}곳 중)</span>
        </button>
      </div>

      <div ref={pickRef}>
        {picked && (
          <div className="eat-picked">
            <div className="eat-picked-label">오늘은 여기 어때요?</div>
            <RestaurantCard {...cardProps(picked)} highlight />
          </div>
        )}
      </div>

      {loading ? (
        <div className="saved-loading">
          <span className="spinner" /> 불러오는 중...
        </div>
      ) : error ? (
        <div className="error">{error}</div>
      ) : restaurants.length === 0 ? (
        <div className="card eat-empty">아직 등록된 가게가 없습니다. 첫 가게를 등록해 보세요.</div>
      ) : filtered.length === 0 ? (
        <div className="card eat-empty">조건에 맞는 가게가 없습니다. 필터를 조금 풀어 보세요.</div>
      ) : (
        <>
          <div className="eat-count">
            {filtered.length}곳 <span>/ 전체 {restaurants.length}곳</span>
          </div>
          <div className="eat-grid">
            {filtered.map((r) => (
              <RestaurantCard key={r.id} {...cardProps(r)} />
            ))}
          </div>
        </>
      )}

      {formFor && (
        <RestaurantForm
          editing={formFor === "new" ? null : formFor}
          admin={admin}
          categories={categories}
          onCategoryAdded={(c) => setCategories((list) => [...list, c])}
          onClose={() => setFormFor(null)}
          onSaved={(r) => {
            replace(r);
            setFormFor(null);
          }}
        />
      )}
      {catsOpen && (
        <CategoryManager
          categories={categories}
          onChanged={reloadCategories}
          onClose={() => setCatsOpen(false)}
        />
      )}
      {adminOpen && (
        <AdminLogin
          onClose={() => setAdminOpen(false)}
          onSuccess={() => {
            setAdmin(true);
            setAdminOpen(false);
          }}
        />
      )}
    </div>
  );
}

function RestaurantCard({
  r,
  now,
  admin,
  budget,
  liked,
  highlight,
  onLike,
  onOrdered,
  onEdit,
  onDelete,
  onToggleRecommend,
}: {
  r: Restaurant;
  now: KstNow | null;
  admin: boolean;
  budget: number | null;
  liked: boolean;
  highlight?: boolean;
  onLike: () => void;
  onOrdered: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleRecommend: () => void;
}) {
  const open = now ? isOpenAt(r, now) : null;
  const price = perPersonPrice(r);
  const ordered = daysSince(r.lastOrderedAt);
  const mealLabels = MEALS.filter((m) => r.meals.includes(m.key)).map((m) => m.label);
  const shownMenus = r.menus.slice(0, 4);

  return (
    <div className={highlight ? "eat-card highlight" : "eat-card"}>
      <div className="eat-card-head">
        <h3>{r.name}</h3>
        {r.recommended && <span className="eat-rec">추천</span>}
        <span className={`eat-status ${open === true ? "open" : open === false ? "closed" : "unknown"}`}>
          {open === true ? "주문 가능" : open === false ? "지금 안 됨" : "시간 미입력"}
        </span>
      </div>

      {(r.categories.length > 0 || mealLabels.length > 0) && (
        <div className="eat-tags">
          {r.categories.map((c) => (
            <span key={c} className="eat-tag">
              {c}
            </span>
          ))}
          {mealLabels.map((m) => (
            <span key={m} className="eat-tag meal">
              {m}
            </span>
          ))}
        </div>
      )}

      <div className="eat-facts">
        {price !== null && (
          <span className={budget && price > budget ? "over" : ""}>
            인당 약 {formatWon(price)}
            {!r.pricePerPerson && " (메뉴 기준)"}
          </span>
        )}
        {r.minOrder && <span>최소주문 {formatWon(r.minOrder)}</span>}
        {r.openTime && r.closeTime && (
          <span>
            {r.openTime}~{r.closeTime}
            {r.breakStart && r.breakEnd && ` (브레이크 ${r.breakStart}~${r.breakEnd})`}
          </span>
        )}
        {r.closedDays.length > 0 && (
          <span>
            {r.closedDays
              .slice()
              .sort()
              .map((d) => DAY_LABELS[d])
              .join("·")}{" "}
            휴무
          </span>
        )}
      </div>

      {(!r.meetPayment || !r.storeDelivery) && (
        <div className="eat-warn">
          {[!r.meetPayment && "만나서결제 불가", !r.storeDelivery && "가게배달 아님"].filter(Boolean).join(" · ")}
        </div>
      )}

      {shownMenus.length > 0 && (
        <ul className="eat-menus">
          {shownMenus.map((m, i) => (
            <li key={i}>
              <span>{m.name}</span>
              {m.price > 0 && <span>{formatWon(m.price)}</span>}
            </li>
          ))}
          {r.menus.length > shownMenus.length && (
            <li className="eat-more">외 {r.menus.length - shownMenus.length}개</li>
          )}
        </ul>
      )}

      {r.memo && <p className="eat-memo">{r.memo}</p>}

      <div className="eat-card-foot">
        {r.baeminUrl ? (
          <a className="eat-btn primary" href={r.baeminUrl} target="_blank" rel="noopener noreferrer">
            배민에서 열기
          </a>
        ) : (
          <span className="eat-nolink">배민 링크 없음</span>
        )}
        <button className={liked ? "eat-btn liked" : "eat-btn"} onClick={onLike} disabled={liked}>
          👍 {r.likes}
        </button>
        <button className="eat-btn" onClick={onOrdered} title="랜덤 뽑기에서 며칠간 덜 나오게 됩니다">
          {ordered === 0 ? "오늘 주문함 ✓" : "여기서 주문함"}
        </button>
        <span className="eat-foot-spacer" />
        {admin && (
          <button className="eat-text-btn" onClick={onToggleRecommend}>
            {r.recommended ? "추천 해제" : "추천"}
          </button>
        )}
        <button className="eat-text-btn" onClick={onEdit}>
          수정
        </button>
        <button className="eat-text-btn danger" onClick={onDelete}>
          삭제
        </button>
      </div>

      <div className="eat-meta">
        {ordered !== null && ordered > 0 && <span>{ordered}일 전 주문</span>}
        {r.createdBy && <span>등록: {r.createdBy}</span>}
      </div>
    </div>
  );
}

function AdminLogin({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await adminLogin(password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="login-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h1>실장 로그인</h1>
        <p className="sub">추천 설정·해제는 실장만 할 수 있습니다.</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="실장 비밀번호"
        />
        <button className="btn" type="submit" disabled={busy || !password}>
          {busy ? "확인 중..." : "로그인"}
        </button>
        {error && <div className="error">{error}</div>}
      </form>
    </div>
  );
}
