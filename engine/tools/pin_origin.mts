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
const DEV = "b52d580e-1938-4a0d-817c-f60f5f00e743";   // Dev 자리(사장님 회사)
const parent = arg("--parent") ?? null;                // 앞 판 결과물 id — 되돌림 검사의 계보가 여기서 이어진다
// 결과물은 `deliverable_scope = "assignment"` 여야 하고 업무가 있어야 한다(제약 deliverables_scope_shape).
// 그래서 "원본 박기" 업무를 하나 만들고 거기에 붙인다. 업무의 previousDeliverableId 가 앞앞 판 찾기에 쓰인다.
const { data: a, error: ae } = await db.from("assignments").insert({
  company_id: CO, company_employee_id: DEV, title, description: `4단계 원본으로 박음(${file}). 끝까지 해 보는 기계: 클리어 ${r.닿은무대}/3.`,
  status: "completed", role_input_json: { approved: true, pinnedOrigin: true, ...(parent ? { previousDeliverableId: parent } : {}) },
  role_input_schema_id: "small_app_assignment_v1", priority: "normal",
}).select("id").single();
if (ae) { console.error(`업무 못 만듦: ${ae.message}`); process.exit(1); }
// **부모의 기준·기대치를 물려받는다**(판 9 시도 4, 09-24). 기준 없이 박았더니 고치는 판의 계획이 새 기준 1개만 내고
// "확인 가능한 기준이 1개뿐(3 필요)" 으로 죽었다. 판 2~8 원본은 기준 17개를 이어 줬다. 원본은 부모의 게임에 고침 하나를 얹은 것이라 부모의 기준이 그대로 맞다.
const { data: pd } = await db.from("deliverables").select("content_json").eq("id", parent).maybeSingle();
const pc = ((pd?.content_json ?? {}) as Record<string, unknown>);
const inherited = Object.fromEntries(["criteria", "coverage", "expectations", "target", "stage", "humanGate"].filter((k) => pc[k] != null).map((k) => [k, pc[k]]));
console.log(`부모에서 물려받음: ${Object.keys(inherited).join(",") || "(없음)"} · 기준 ${Array.isArray(pc.criteria) ? (pc.criteria as unknown[]).length : 0}개`);
const { data, error } = await db.from("deliverables").insert({
  company_id: CO, assignment_id: a!.id, company_employee_id: DEV, deliverable_scope: "assignment",
  title, deliverable_type: "app_build", status: "submitted", submitted_at: new Date().toISOString(),
  parent_deliverable_id: parent,
  content_markdown: `4단계 원본으로 박음(09-24). 끝까지 해 보는 기계: 클리어 ${r.닿은무대}/3.`,
  content_json: { ...inherited, files: [{ path: "index.html", language: "html", contents: html }], origin: { pinnedAt: new Date().toISOString(), cleared: true, from: file, parent } },
}).select("id").single();
if (error) { console.error(`못 박음: ${error.message}`); process.exit(1); }
console.log(`원본 결과물: ${data!.id} · 업무 ${a!.id} · ${title}`);
