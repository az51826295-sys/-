/**
 * 배운 것 화면의 문 자 (109회차 09-14) — 실서버, 모델 없음, 돈 0.
 *   가짜 회사·후보·규칙을 심고 사용자 세션으로 GET /api/learning → 규칙 1·최근 1·수치가 보이는가,
 *   남의 계정 GET → 규칙 0, 남의 계정 POST 끄기 → 404, 주인 POST 끄기 → 규칙 0·knowledge deprecated·후보 rejected.
 *   끝에 사용자를 지운다(cascade). 눈검수는 --shot 로 헤드리스 Edge 화면을 찍는다(PowerShell 에서).
 *   npx tsx engine/tools/rookery_env.mts engine/tools/rookery_learning_test.mts [BASE] [--shot]
 */
import { createClient } from "@supabase/supabase-js";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const BASE = process.argv.find((a) => a.startsWith("http")) ?? "https://rookery-web-production.up.railway.app";
const SHOT = process.argv.includes("--shot");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const svc = createServiceClient();
const password = "learn-pass-0914!";
const lines: [boolean, string][] = [];
let uid = "", uid2 = "";
try {
  const email = `learn-${Date.now()}@rookery.local`;
  const { data: made, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true }); if (error) throw error; uid = made.user.id;
  const email2 = `other-${Date.now()}@rookery.local`;
  const { data: made2 } = await svc.auth.admin.createUser({ email: email2, password, email_confirm: true }); uid2 = made2!.user!.id;
  const ref = new URL(url).hostname.split(".")[0];
  const cookieFor = async (em: string) => {
    const c = createClient(url, anon, { auth: { persistSession: false } });
    const { data: s } = await c.auth.signInWithPassword({ email: em, password });
    return `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(s!.session)).toString("base64url")}`;
  };
  const cookie = await cookieFor(email), cookie2 = await cookieFor(email2);

  const co = (await svc.from("companies").insert({ owner_id: uid, name: "배운 것 자 회사" }).select("id").single()).data!;
  const reason = JSON.stringify({ violation_test: "자", counts: { a: 10, b: 1, c: 13, d: 35 }, judged: 59, lift: 0.64, p: 0.0004, holdout: 59 });
  const cand = (await svc.from("learning_candidates").insert({ company_id: co.id, title: "자 규칙", summary: "자 규칙 본문", reason, category: "quality_improvement", confidence: "high", status: "approved", manager_note: "자동 검증(보류 사례 59건): 채택: lift 0.64, p=0.000, 어긴 사례 11건", decided_at: new Date().toISOString() }).select("id").single()).data!;
  const k = (await svc.from("organization_knowledge").insert({ company_id: co.id, title: "자 규칙 (검증된 규칙)", description: "자 규칙 본문", category: "quality_improvement", status: "active", learning_candidate_id: cand.id }).select("id").single()).data!;

  const get = async (ck: string) => { const r = await fetch(`${BASE}/api/learning`, { headers: { cookie: ck } }); return { status: r.status, j: (await r.json().catch(() => ({}))) as { rules?: { id: string; title: string; counts?: { a: number } | null; p?: number | null }[]; recent?: { status: string }[]; runs?: unknown[] } }; };
  const post = async (ck: string, id: string) => { const r = await fetch(`${BASE}/api/learning`, { method: "POST", headers: { cookie: ck, "content-type": "application/json" }, body: JSON.stringify({ knowledgeId: id }) }); return r.status; };

  const g1 = await get(cookie);
  const r0 = g1.j.rules?.[0];
  lines.push([g1.status === 200 && g1.j.rules?.length === 1 && r0?.title === "자 규칙" && r0?.counts?.a === 10 && r0?.p === 0.0004, `주인 GET → ${g1.status} · 규칙 ${g1.j.rules?.length} · 제목 "${r0?.title}" · a=${r0?.counts?.a} p=${r0?.p}`]);
  lines.push([g1.j.recent?.length === 1 && g1.j.recent[0].status === "approved" && Array.isArray(g1.j.runs), `최근 시험 ${g1.j.recent?.length}건(${g1.j.recent?.[0]?.status}) · 실행 기록 ${g1.j.runs?.length}줄`]);
  const g2 = await get(cookie2);
  lines.push([g2.status === 200 && g2.j.rules?.length === 0, `남의 계정 GET → ${g2.status} · 규칙 ${g2.j.rules?.length} (0)`]);
  const p2 = await post(cookie2, k.id);
  lines.push([p2 === 404, `남의 계정 끄기 → ${p2} (404)`]);
  const p1 = await post(cookie, k.id);
  const { data: kk } = await svc.from("organization_knowledge").select("status").eq("id", k.id).single();
  const { data: cc } = await svc.from("learning_candidates").select("status, manager_note").eq("id", cand.id).single();
  const g3 = await get(cookie);
  lines.push([p1 === 200 && kk?.status === "deprecated" && cc?.status === "rejected" && (cc?.manager_note ?? "").includes("사장님이 껐어요") && g3.j.rules?.length === 0, `주인 끄기 → ${p1} · 규칙 ${kk?.status} · 후보 ${cc?.status} · 다시 GET 규칙 ${g3.j.rules?.length}`]);

  if (SHOT) {
    const puppeteer = (await import("puppeteer-core")).default;
    const { mkdtempSync, rmSync } = await import("node:fs"); const { tmpdir } = await import("node:os"); const { join } = await import("node:path");
    await svc.from("organization_knowledge").update({ status: "active" }).eq("id", k.id);
    const profile = mkdtempSync(join(tmpdir(), "rk-learn-"));
    const browser = await puppeteer.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true, userDataDir: profile, args: ["--no-first-run", "--lang=ko-KR", "--disable-gpu"] });
    try {
      const { data: link } = await svc.auth.admin.generateLink({ type: "magiclink", email });
      const page = await browser.newPage(); await page.setViewport({ width: 420, height: 860, deviceScaleFactor: 2 });
      await page.goto(`${BASE}/auth/confirm?token_hash=${link?.properties?.hashed_token ?? ""}&type=magiclink`, { waitUntil: "networkidle2" });
      await page.mouse.click(45, 45);
      await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.includes("배운 것")), { timeout: 8000 });
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("배운 것"))?.click());
      await page.waitForFunction(() => document.body.textContent?.includes("지키는 규칙"), { timeout: 8000 });
      await new Promise((r) => setTimeout(r, 600));
      const out = join(tmpdir(), "rookery-learned.png");
      await page.screenshot({ path: out as `${string}.png` });
      console.log("화면 →", out);
    } finally { await browser.close(); rmSync(profile, { recursive: true, force: true }); }
  }
} catch (e) {
  lines.push([false, `오류: ${e instanceof Error ? e.message : String(e)}`]);
} finally {
  if (uid) await svc.auth.admin.deleteUser(uid);
  if (uid2) await svc.auth.admin.deleteUser(uid2);
}
for (const [ok, l] of lines) console.log(ok ? "통과" : "실패", l);
const bad = lines.filter(([ok]) => !ok).length;
console.log(bad ? `실패 ${bad}` : "전부 통과");
process.exitCode = bad ? 1 : 0;
