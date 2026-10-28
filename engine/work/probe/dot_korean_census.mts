/**
 * **남은 한국어가 화면 글인가, 표에서 온 내용인가** (10-28).
 *   npx tsx engine/work/probe/dot_korean_census.mts
 *
 * 영어로 바꿔도 77% 가 한국어였다. 그런데 **고치는 법이 둘로 갈린다**:
 *   - 화면 글(단추·안내문) → 코드에 낱말표를 넣으면 끝난다
 *   - 표에서 온 내용(게시물 본문·첫 인사·캐릭터 이름) → 표에 영어 칸을 만들어야 한다
 *
 * 둘을 안 가르고 "77%" 만 들고 가면 **어느 쪽이 큰지 모르는 채로 작은 쪽부터 고치게 된다.**
 * 그래서 화면에서 꺼낸 한국어를 표의 내용과 **글자로 대 본다**.
 */
import puppeteer from "puppeteer-core";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "https://dot-web-production-7e03.up.railway.app";
const vars = JSON.parse(readFileSync(process.env.SCRATCH + "/dotvars.json", "utf8")) as Record<string, string>;
const H = { apikey: vars.SUPABASE_SECRET_KEY, authorization: "Bearer " + vars.SUPABASE_SECRET_KEY };

/* 표에서 온 글을 전부 모은다 — 게시물 본문·캐릭터 이름/한 줄/첫 인사/추천 단어. */
const 표글 = new Set<string>();
for (const [t, cols] of [["dot_posts", "caption"], ["dot_characters", "name,tagline,greeting,chips"]] as const) {
  const r = await fetch(`${vars.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${t}?select=${cols}`, { headers: H });
  for (const row of (await r.json()) as Record<string, unknown>[]) {
    for (const v of Object.values(row)) {
      if (typeof v === "string") 표글.add(v);
      else if (Array.isArray(v)) for (const x of v) if (typeof x === "string") 표글.add(x);
    }
  }
}
console.log(`표에서 온 글 ${표글.size}덩어리`);

const 화면 = ["/dot/feed", "/dot/search", "/dot/chats", "/dot/me", "/dot/settings", "/dot/nabi"];
const profile = mkdtempSync(join(tmpdir(), "rk-hl-census-"));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true, userDataDir: profile, args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const p = await browser.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await p.goto(BASE + "/dot/settings", { waitUntil: "networkidle2", timeout: 60000 });
  await p.evaluate(() => localStorage.setItem("dot_lang", "en"));

  let 표에서 = 0, 화면글 = 0;
  const 화면글보기 = new Set<string>();
  for (const 길 of 화면) {
    await p.goto(BASE + 길, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 2200));
    const t = await p.evaluate(() => document.body.innerText ?? "");
    for (const 줄 of t.split(/\n+/).map((s) => s.trim()).filter(Boolean)) {
      const 한글 = (줄.match(/[\uac00-\ud7a3]/g) ?? []).length;
      if (!한글) continue;
      /* 표의 어떤 덩어리에 이 줄이 들어 있나 — 들어 있으면 표에서 온 것이다. */
      const 표것 = [...표글].some((v) => v.includes(줄) || 줄.includes(v));
      if (표것) 표에서 += 한글;
      else { 화면글 += 한글; 화면글보기.add(줄.slice(0, 34)); }
    }
  }
  const 합 = 표에서 + 화면글;
  console.log(`\n남은 한글 ${합}자`);
  console.log(`  표에서 온 내용 ${표에서}자 (${((표에서 / 합) * 100).toFixed(0)}%) — 표에 영어 칸이 필요`);
  console.log(`  화면 글      ${화면글}자 (${((화면글 / 합) * 100).toFixed(0)}%) — 낱말표로 끝난다`);
  console.log(`\n낱말표에 넣을 줄 ${화면글보기.size}개:`);
  for (const s of [...화면글보기].sort()) console.log("  " + s);
} finally {
  await browser.close();
  /* 치우다 실패하는 것은 **시험 결과가 아니다** — EPERM 하나에 판정이 통째로 날아갔다. */
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* 윈도가 잠깐 쥐고 있다 */ }
}
