/**
 * **점프를 재는 자** — 재는 코드는 `src/lib/skills/appBuild/webMeasures.ts` 한 곳에 있고
 * 이 도구와 **고리가 같이 쓴다**(205회차 09-22). 자가 둘이면 또 두 숫자가 생긴다.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/jump_measure.mts <html경로> [--json]
 */
const { openHeadless } = await import("../../src/lib/video/headless");
const { measureJump } = await import("../../src/lib/skills/appBuild/webMeasures");
const { readFileSync } = await import("node:fs");
const path = process.argv.find((a) => a.endsWith(".html"));
if (!path) { console.error("HTML 경로를 주세요"); process.exit(1); }
const html = readFileSync(path, "utf8");

const hl = await openHeadless({ width: 1280, height: 720 });
if (!hl) { console.error("브라우저가 없다"); process.exit(1); }
try {
  const page = await hl.browser.newPage();
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(String(e.message ?? e).slice(0, 120)));
  await page.setRequestInterception(true);
  page.on("request", (r) => { const u = r.url(); if (u.startsWith("data:") || u === "about:blank") void r.continue(); else void r.abort(); });
  await page.setContent(html, { waitUntil: "load" });
  await new Promise((r) => setTimeout(r, 600));
  const m = await measureJump(page);
  if (!m) { console.log("**못 잼** — 이 게임에서 점프를 읽을 수 없다"); process.exit(0); }
  if (process.argv.includes("--json")) console.log(JSON.stringify({ ...m, 오류: errs }));
  else {
    console.log(`재는 대상: ${path}`);
    console.log(`  **높이 ${m["점프.높이px"]}px** · **공중 ${m["점프.공중프레임"]}프레임**  ← 이 둘이 난간이다`);
    console.log(`  곡선: 상승 ${m["점프.상승프레임"]} · 꼭대기 ${m["점프.꼭대기프레임"]} · 하강 ${m["점프.하강프레임"]}`);
    console.log(`  하강÷상승 = ${m["점프.하강나누기상승"]} (1보다 작아야 "내려올 때 더 빠르다")`);
    if (errs.length) console.log(`  오류: ${errs.join(" · ")}`);
  }
} finally { await hl.close(); }
