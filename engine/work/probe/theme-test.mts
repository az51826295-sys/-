/**
 * **꾸미기가 지금 화면을 안 망가뜨리나** (10-25). 모델 0 · 값 0.
 *   npx tsx engine/work/probe/theme-test.mts
 *
 * 제일 중요한 것: **아무것도 안 건드리면 지금과 똑같아야 한다.**
 * 그걸 눈으로 "비슷하네" 하고 넘기면 나중에 색이 조용히 어긋난다 → `globals.css` 에 박힌
 * 값과 **숫자로** 댄다.
 */
import { readFileSync } from "node:fs";
import { applyTheme, getTheme, DEFAULT_THEME } from "@/lib/ui/theme";

let 나쁨 = 0;
const 재기 = (n: string, ok: boolean, 본?: unknown) => {
  if (!ok) 나쁨++;
  console.log((ok ? "통과" : "실패") + " " + n + (본 === undefined ? "" : "  " + JSON.stringify(본)));
};

/** `applyTheme` 이 쓰는 document 를 가짜로 세운다 */
const 꽂힌것: Record<string, string> = {};
const g = globalThis as unknown as { document: unknown; localStorage: unknown };
g.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
g.document = {
  documentElement: { style: { setProperty: (k: string, v: string) => { 꽂힌것[k] = v; } }, dataset: {} as Record<string, string> },
};

/* ── ① 안 건드리면 globals.css 와 같은가 ── */
applyTheme(DEFAULT_THEME);
const css = readFileSync("src/app/globals.css", "utf8");
const css값 = (이름: string) => (css.match(new RegExp("--rk-" + 이름 + ":\\s*(#[0-9a-fA-F]{3,8})")) ?? [])[1]?.toLowerCase();

for (const 이름 of ["paper", "ink", "100", "200", "400", "600", "800"]) {
  const 지금 = (꽂힌것["--rk-" + 이름] ?? "").toLowerCase();
  const 원래 = css값(이름);
  if (!원래) { console.log("     (globals.css 에서 --rk-" + 이름 + " 을 못 찾아 못 잼)"); continue; }
  /* 섞어서 만든 값이라 1~2 만큼은 어긋날 수 있다. 눈에 안 보이는 차이까지 틀렸다고 하지 않는다. */
  const 거리 = (a: string, b: string) => {
    const p = (c: string) => { const n = parseInt(c.replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
    return Math.max(Math.abs(r1 - r2), Math.abs(g1 - g2), Math.abs(b1 - b2));
  };
  const d = 거리(지금, 원래);
  재기(`--rk-${이름} 가 지금 화면과 같다 (차이 ${d})`, d <= 3, { 만든것: 지금, 원래: 원래 });
}

/* ── ② 뒤집어도 규칙이 참인가 — 100 이 바탕에 가장 가깝다 ── */
applyTheme({ ...DEFAULT_THEME, paper: "#ffffff", ink: "#000000" });
const 밝기 = (c: string) => { const n = parseInt(c.replace("#", ""), 16); return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114; };
const 단계값 = ["100", "200", "400", "600", "800"].map((x) => 밝기(꽂힌것["--rk-" + x]));
const 바탕 = 밝기("#ffffff");
재기("밝은 바탕으로 뒤집으면 단계도 따라 뒤집힌다",
  단계값.every((v, i) => i === 0 || v < 단계값[i - 1]) && Math.abs(단계값[0] - 바탕) < Math.abs(단계값[4] - 바탕),
  { 단계밝기: 단계값.map((v) => Math.round(v)) });

/* ── ③ 배율·글꼴 스위치가 꽂히나 ── */
applyTheme({ ...DEFAULT_THEME, size: 1.25, density: 0.8, pixel: false });
재기("글자 배율이 꽂힌다", 꽂힌것["--rk-글자배"] === "1.25", { 값: 꽂힌것["--rk-글자배"] });
재기("여백 배율이 꽂힌다", 꽂힌것["--rk-여백배"] === "0.8", { 값: 꽂힌것["--rk-여백배"] });
const ds = (g.document as { documentElement: { dataset: Record<string, string> } }).documentElement.dataset;
재기("픽셀 글꼴을 끄면 표시가 남는다", ds.rkPixel === "off", { dataset: ds });

/* ── ④ 저장소가 막혀도 안 죽나 ── */
g.localStorage = { getItem: () => { throw new Error("막힘"); }, setItem: () => { throw new Error("막힘"); }, removeItem: () => {} };
재기("저장소가 막혀도 처음 값으로 돈다", getTheme().paper === DEFAULT_THEME.paper, {});

console.log("\n못 잰 것: 진짜 브라우저에서 색이 눈에 어떻게 보이는지 — 숫자가 같다는 것까지만 잰다.");
console.log(나쁨 ? `\n**${나쁨}개 실패**` : "\n전부 통과");
process.exit(나쁨 ? 1 : 0);
