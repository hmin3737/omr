// Eat: 배달 맛집 데이터베이스 공용 타입·상수·판정 로직 (클라이언트/서버 공용)

export const CATEGORIES = [
  "한식",
  "국밥·찌개",
  "중식",
  "일식·돈까스",
  "분식",
  "도시락·덮밥",
  "양식",
  "아시안",
  "치킨",
  "피자",
  "버거·샌드위치",
  "샐러드·건강식",
  "기타",
] as const;

export const MEALS = [
  { key: "breakfast", label: "아침" },
  { key: "lunch", label: "점심" },
  { key: "dinner", label: "저녁" },
] as const;
export type MealKey = (typeof MEALS)[number]["key"];

export const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export const DEFAULT_BUDGET = 15000;

export interface MenuItem {
  name: string;
  price: number;
}

/** 등록/수정 시 주고받는 가게 정보 */
export interface RestaurantInput {
  name: string;
  baeminUrl: string;
  categories: string[];
  meals: string[];
  openTime: string; // "HH:MM", 빈 값이면 미입력
  closeTime: string;
  breakStart: string;
  breakEnd: string;
  closedDays: number[]; // 0(일)~6(토)
  meetPayment: boolean; // 만나서 카드결제
  storeDelivery: boolean; // 가게배달
  pricePerPerson: number | null;
  minOrder: number | null;
  menus: MenuItem[];
  memo: string;
  createdBy: string;
  recommended: boolean;
}

export interface Restaurant extends RestaurantInput {
  id: string;
  likes: number;
  lastOrderedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function emptyRestaurantInput(): RestaurantInput {
  return {
    name: "",
    baeminUrl: "",
    categories: [],
    meals: [],
    openTime: "",
    closeTime: "",
    breakStart: "",
    breakEnd: "",
    closedDays: [],
    meetPayment: true,
    storeDelivery: true,
    pricePerPerson: null,
    minOrder: null,
    menus: [],
    memo: "",
    createdBy: "",
    recommended: false,
  };
}

// ---- 시간 판정 (항상 한국 시간 기준) ----

export interface KstNow {
  day: number; // 0(일)~6(토)
  minutes: number; // 0시부터 경과 분
}

export function kstNow(date = new Date()): KstNow {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { day, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** 지금 시각에 해당하는 끼니 (식사 시간대가 아니면 다음 끼니) */
export function currentMeal(now: KstNow): MealKey {
  if (now.minutes < 10 * 60 + 30) return "breakfast";
  if (now.minutes < 15 * 60) return "lunch";
  return "dinner";
}

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

function inRange(m: number, start: number, end: number): boolean {
  // end <= start 이면 자정을 넘기는 구간
  return end > start ? m >= start && m < end : m >= start || m < end;
}

/** 지금 주문 가능한지. 영업시간 미입력이면 null(알 수 없음). */
export function isOpenAt(r: RestaurantInput, now: KstNow): boolean | null {
  const open = toMinutes(r.openTime);
  const close = toMinutes(r.closeTime);
  if (open === null || close === null) return r.closedDays.includes(now.day) ? false : null;

  // 자정을 넘겨 영업 중인 새벽 시간은 전날 영업으로 본다
  const overnightTail = close <= open && now.minutes < close;
  const businessDay = overnightTail ? (now.day + 6) % 7 : now.day;
  if (r.closedDays.includes(businessDay)) return false;
  if (!inRange(now.minutes, open, close)) return false;

  const bs = toMinutes(r.breakStart);
  const be = toMinutes(r.breakEnd);
  if (bs !== null && be !== null && inRange(now.minutes, bs, be)) return false;
  return true;
}

/** 인당 예상 금액: 직접 입력값 우선, 없으면 메뉴 가격 중앙값 */
export function perPersonPrice(r: RestaurantInput): number | null {
  if (r.pricePerPerson) return r.pricePerPerson;
  const prices = r.menus.map((m) => m.price).filter((p) => p > 0).sort((a, b) => a - b);
  if (!prices.length) return null;
  const mid = Math.floor(prices.length / 2);
  return prices.length % 2 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2);
}

/** 가게 주문 조건(만나서 카드결제 + 가게배달)을 모두 만족하는지 */
export function meetsOrderRules(r: RestaurantInput): boolean {
  return r.meetPayment && r.storeDelivery;
}

export function formatWon(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

// ---- 서버 측 입력 정리 ----

function str(v: unknown, max: number): string {
  return String(v ?? "").trim().slice(0, max);
}

function time(v: unknown): string {
  const s = str(v, 5);
  return toMinutes(s) === null ? "" : s;
}

function amount(v: unknown): number | null {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 && n < 10_000_000 ? n : null;
}

function url(v: unknown): string {
  const s = str(v, 500);
  return /^https?:\/\//i.test(s) ? s : "";
}

/** 요청 본문을 저장 가능한 형태로 정리. 이름이 비면 null. */
export function sanitizeRestaurantInput(body: unknown): RestaurantInput | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = str(b.name, 60);
  if (!name) return null;
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  const mealKeys: string[] = MEALS.map((m) => m.key);
  return {
    name,
    baeminUrl: url(b.baeminUrl),
    categories: list(b.categories)
      .map(String)
      .filter((c) => (CATEGORIES as readonly string[]).includes(c)),
    meals: list(b.meals).map(String).filter((m) => mealKeys.includes(m)),
    openTime: time(b.openTime),
    closeTime: time(b.closeTime),
    breakStart: time(b.breakStart),
    breakEnd: time(b.breakEnd),
    closedDays: Array.from(new Set(list(b.closedDays).map(Number))).filter(
      (d) => Number.isInteger(d) && d >= 0 && d <= 6
    ),
    meetPayment: b.meetPayment !== false,
    storeDelivery: b.storeDelivery !== false,
    pricePerPerson: amount(b.pricePerPerson),
    minOrder: amount(b.minOrder),
    menus: list(b.menus)
      .slice(0, 30)
      .map((m) => {
        const item = (m ?? {}) as Record<string, unknown>;
        return { name: str(item.name, 60), price: amount(item.price) ?? 0 };
      })
      .filter((m) => m.name),
    memo: str(b.memo, 500),
    createdBy: str(b.createdBy, 20),
    recommended: b.recommended === true,
  };
}
