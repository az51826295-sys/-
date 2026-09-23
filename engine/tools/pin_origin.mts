/**
 * **파일 하나를 사장님 회사의 결과물로 박는다** — 4단계 새 원본용 (09-24).
 * 개정판 8 ⑮: 원본으로 못 박기 전에 `게임.클리어 = 1` 을 확인한다. 못 깨면 안 박는다.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/pin_origin.mts --file <html> --title "<제목>"
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { openHeadless } = await import("../../src/lib/video/headless");
const { playThrough } = await import("../../src/lib/skills/appBuild/playThrough");
const { readFileSync } = await import("node:fs");
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const file = arg("--file")!, title = arg("--title") ?? "별빛 플랫포머 — 4단계 원본";
const html = readFileSync(file, "utf8");
const CO = "5925c03a-557f-46d7-8589-7388b769df40"; // 권혁수

// ⑮ 먼저 깨 본다
const hl = await openHeadless({ width: 1280, height: 720 });
if (!hl) { console.error("브라우저를 못 열었다 — 안 박는다"); process.exit(1); }
let r;
try {
  const page = await hl.browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", (q) => { const u = q.url(); if (u.startsWith("data:") || u === "about:blank") void q.continue(); else void q.abort(); });
  await page.setContent(html, { waitUntil: "load" });
  await new Promise((s) => setTimeout(s, 500));
  r = await playThrough(page, 4000);
} finally { await hl.close(); }
console.log(`끝까지 해 봄: ${r.끝} (무대 ${r.닿은무대}/3 · 목숨 잃음 ${r.잃은목숨})`);
if (r.끝 !== "클리어") { console.error("**못 깬다 — 원본으로 못 박는다**(개정판 8 ⑮)"); process.exit(1); }

const db = createServiceClient();
const { data, error } = await db.from("deliverables").insert({
  company_id: CO, title, deliverable_type: "app",
  content_markdown: `4단계 원본으로 박음(09-24). 끝까지 해 보는 기계: 클리어 ${r.닿은무대}/3.`,
  content_json: { files: [{ path: "index.html", language: "html", contents: html }], origin: { pinnedAt: new Date().toISOString(), cleared: true, from: file } },
}).select("id").single();
if (error) { console.error(`못 박음: ${error.message}`); process.exit(1); }
console.log(`원본 결과물: ${data!.id} · ${title}`);
