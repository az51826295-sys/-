/**
 * **화면 꾸미기 — 사장님이 돌린다** (10-25).
 *
 * 사장님: "지금 유아이 구성은 너무 지피티 같아" → 그렇다고 **내 취향으로 새로 그리지 않는다**
 * (취향은 사장님 것이다). 대신 이미 있는 토큰 체계를 **밖으로 꺼내** 돌릴 수 있게 한다.
 *
 * `globals.css` 가 세운 규칙을 그대로 지킨다:
 *   · `paper` 는 바탕, `ink` 는 글자 — **흰색·검은색이라는 뜻이 아니다.** 뒤집어도 이름이 안 거짓말한다
 *   · 명도 다섯 단계(100·200·400·600·800)는 **바탕에서 얼마나 떨어졌는가**다
 *     → 그래서 다섯 단계를 손으로 고르게 하지 않고 **paper→ink 사이에서 계산한다.**
 *       어떤 색 짝을 골라도 "100 이 바탕에 가장 가깝다" 가 참으로 남는다.
 *
 * 내보내는 이름은 ASCII 로 둔다 — 한글 export 는 tsx 가 조용히 흘린다(10-25).
 */

export type 꾸밈 = {
  /** 바탕색 */
  paper: string;
  /** 글자색 */
  ink: string;
  /** 일하는 중을 알리는 색 */
  accent: string;
  /** 픽셀 글꼴을 쓸까 */
  pixel: boolean;
  /** 글자 크기 배율 (0.85 ~ 1.4) */
  size: number;
  /** 빽빽함 배율 (0.7 = 촘촘, 1.3 = 널찍) */
  density: number;
};

/** 지금 `globals.css` 에 박힌 값 그대로 — "되돌리기" 가 진짜 처음으로 돌아가게 */
export const DEFAULT_THEME: 꾸밈 = {
  paper: "#0a0a0a",
  ink: "#ffffff",
  accent: "#e02a2a",
  pixel: true,
  size: 1,
  density: 1,
};

const 키 = "rookery.ui.theme";

export function getTheme(): 꾸밈 {
  if (typeof localStorage === "undefined") return DEFAULT_THEME;
  try {
    const v = JSON.parse(localStorage.getItem(키) ?? "{}") as Partial<꾸밈>;
    return { ...DEFAULT_THEME, ...v };
  } catch { return DEFAULT_THEME; }
}

export function setTheme(바꿀것: Partial<꾸밈>): 꾸밈 {
  const 다음 = { ...getTheme(), ...바꿀것 };
  try { localStorage.setItem(키, JSON.stringify(다음)); } catch { /* 저장소 없음 */ }
  applyTheme(다음);
  return 다음;
}

export function resetTheme(): 꾸밈 {
  try { localStorage.removeItem(키); } catch { /* 저장소 없음 */ }
  applyTheme(DEFAULT_THEME);
  return DEFAULT_THEME;
}

/* ── 색 섞기 ───────────────────────────────────────────── */
const 자르기 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
function 풀기(c: string): [number, number, number] {
  const s = c.trim().replace("#", "");
  const 꽉 = s.length === 3 ? s.split("").map((x) => x + x).join("") : s;
  const n = parseInt(꽉.slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [0, 0, 0];
}
const 묶기 = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((x) => 자르기(x).toString(16).padStart(2, "0")).join("");
/** `a` 에서 `b` 쪽으로 `t` 만큼 */
function 섞기(a: string, b: string, t: number): string {
  const [r1, g1, b1] = 풀기(a), [r2, g2, b2] = 풀기(b);
  return 묶기(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/**
 * 다섯 단계가 설 자리 — 지금 `globals.css` 값에서 **거꾸로 계산한** 비율이다.
 * `t = (지금값 - paper) / (ink - paper)` 로 뽑았다:
 *   #1a1a1a→0.0653 · #2b2b2b→0.1347 · #6b6b6b→0.3959 · #a8a8a8→0.6449 · #e2e2e2→0.8816
 *
 * 처음엔 0.10/0.17/0.42/0.66/0.89 로 **눈대중** 했는데, 그건 0 에서부터 잰 비율이라
 * 바탕이 #0a 인 것을 안 빼서 100·200 이 9씩 밝게 나왔다(자가 잡았다).
 * → 그래서 아무것도 안 건드리면 지금 화면과 **똑같다**는 말이 참이 된다.
 */
const 단계 = [["100", 0.0653], ["200", 0.1347], ["400", 0.3959], ["600", 0.6449], ["800", 0.8816]] as const;

/** 고른 값을 실제 화면에 입힌다. `:root` 의 CSS 변수를 덮어쓴다. */
export function applyTheme(t: 꾸밈 = getTheme()): void {
  if (typeof document === "undefined") return;
  const r = document.documentElement.style;
  r.setProperty("--rk-paper", t.paper);
  r.setProperty("--rk-ink", t.ink);
  for (const [이름, 몫] of 단계) r.setProperty(`--rk-${이름}`, 섞기(t.paper, t.ink, 몫));
  r.setProperty("--rk-일", t.accent);
  r.setProperty("--rk-일-연", 섞기(t.accent, t.ink, 0.35));
  /* 글자·여백은 배율로 둔다 — 화면마다 박힌 px 를 전부 고치지 않고 뿌리에서 한 번에 돌린다 */
  r.setProperty("--rk-글자배", String(t.size));
  r.setProperty("--rk-여백배", String(t.density));
  document.documentElement.dataset.rkPixel = t.pixel ? "on" : "off";
}
