// 177회차 재촉 시험 — 일을 시킨 직후 "시작"·"만들어" 가 새 일이 되지 않는가(실전, ≈$0.01).
//   ROOKERY_DEMO_PASSWORD=… npx tsx engine/tools/rookery_env.mts engine/tools/rush_probe.mts
// 177회차 실전 시험: 일을 시킨 직후 "시작"·"만들어" 재촉이 새 일이 되지 않는가. 값 ≈ $0.01 (luna 웹 판 하나).
const SITE = process.env.ROOKERY_SITE ?? "https://rookery-web-production.up.railway.app";
const EMAIL = "demo-rookery@rookery.local";
const PASSWORD = process.env.ROOKERY_DEMO_PASSWORD ?? "";
if (!PASSWORD) { console.error("ROOKERY_DEMO_PASSWORD 가 필요하다"); process.exit(2); }
const { createClient } = await import("@supabase/supabase-js");
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { changeFacts } = await import("../../src/lib/genesis/askJudge");

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = createClient(SUPA, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
const { data: auth, error: authErr } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (authErr || !auth.session) { console.error("로그인 실패:", authErr?.message); process.exit(1); }
const s = auth.session;
const ref = new URL(SUPA).hostname.split(".")[0];
const val = "base64-" + Buffer.from(JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at, expires_in: s.expires_in, token_type: s.token_type, user: s.user })).toString("base64url");
const name = `sb-${ref}-auth-token`;
const CHUNK = 3180; // @supabase/ssr 가 긴 쿠키를 .0 .1 로 나눠 읽는다
const cookie = val.length <= CHUNK ? `${name}=${val}` : Array.from({ length: Math.ceil(val.length / CHUNK) }, (_, i) => `${name}.${i}=${val.slice(i * CHUNK, (i + 1) * CHUNK)}`).join("; ");

const db = createServiceClient();
const { data: co } = await db.from("companies").select("id").eq("owner_id", s.user.id).maybeSingle();
if (!co) { console.error("데모 회사가 없다"); process.exit(1); }
const companyId = co.id as string;

type Msg = { role: "user" | "assistant"; content: string };
const history: Msg[] = [];
let conversationId: string | null = null;
const hm = () => new Date().toLocaleTimeString("ko-KR", { hour12: false });

async function say(text: string): Promise<{ reply: string; assignment: { id: string; title: string } | null }> {
  history.push({ role: "user", content: text });
  const r = await fetch(`${SITE}/api/chat`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ messages: history, conversationId }) });
  if (!r.ok || !r.body) throw new Error(`/api/chat ${r.status}`);
  const textAll = await r.text();
  const box: { done: Record<string, unknown> | null } = { done: null };
  for (const line of textAll.split("\n")) { if (!line.trim()) continue; try { const ev = JSON.parse(line) as { type: string }; if (ev.type === "done") box.done = ev as unknown as Record<string, unknown>; if (ev.type === "error") throw new Error(JSON.stringify(ev)); } catch (e) { if (e instanceof SyntaxError) continue; throw e; } }
  const done = box.done;
  if (!done) throw new Error("답이 안 끝났다");
  conversationId = (done.conversationId as string) ?? conversationId;
  const reply = String(done.reply ?? "");
  history.push({ role: "assistant", content: reply });
  console.log(`${hm()} 나: ${text}\n${hm()} 로키: ${reply.replace(/\s+/g, " ").slice(0, 200)}`);
  return { reply, assignment: (done.assignment as { id: string; title: string } | null) ?? null };
}
const t0iso = new Date().toISOString();
const countJobs = async () => (await db.from("assignments").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("created_at", t0iso)).count ?? 0;
const a1 = await say(process.env.ORDER ?? "터치로 하는 두더지 잡기 게임 HTML 한 파일로 만들어 줘. 20초 제한, 점수 표시.");
console.log(`${hm()} 업무:`, a1.assignment?.id?.slice(0, 8) ?? "없음");
const a2 = await say("시작");
const a3 = await say("만들어");
console.log(`${hm()} 업무 수(기대 1):`, await countJobs(), "| 업무 붙음?", !!a2.assignment, !!a3.assignment);
const t0 = Date.now();
let finished = false;
while (Date.now() - t0 < 12 * 60_000) {
  await new Promise((r) => setTimeout(r, 15_000));
  const { data: a } = await db.from("assignments").select("status").eq("id", a1.assignment!.id).single();
  if (["completed", "submitted"].includes(a!.status)) { finished = true; break; }
  if (["failed", "cancelled"].includes(a!.status)) { console.log("업무 실패:", a!.status); break; }
}
console.log(`${hm()} 결과 ${finished ? "나옴" : "안 나옴"} · ${Math.round((Date.now() - t0) / 6000) / 10}분 · 업무 수 최종`, await countJobs());
const { data: ex } = await db.from("work_executions").select("status, current_step, metrics_json").eq("assignment_id", a1.assignment!.id);
console.log("실행:", JSON.stringify(ex?.map((e) => [e.status, e.current_step, (e.metrics_json as any)?.loop])));
const { data: dl } = await db.from("deliverables").select("content_json, content_markdown").eq("assignment_id", a1.assignment!.id).maybeSingle();
const cj = dl?.content_json as any;
console.log("고리:", JSON.stringify(cj?.loop ? { rounds: cj.loop.rounds.map((r: any) => [r.n, r.met, r.unmet, r.errors, r.edits, r.usd]), best: cj.loop.bestRound, by: cj.loop.stoppedBy, usd: cj.loop.usd } : null));
console.log((dl?.content_markdown as string ?? "").split("## 확인한 것")[0].slice(0, 900));

// --fixes N: 결과가 온 뒤 "고쳐 줘" 를 N 번 보내고 매번 어느 자리가 고쳤는지(seats.fix) 본다(183회차 섞어 보내기).
const fi = process.argv.indexOf("--fixes");
const fixes = fi > 0 ? Number(process.argv[fi + 1]) : 0;
const asks = ["공이 너무 빨라. 속도를 절반으로 줄여 줘.", "패들을 조금 더 넓게 해 줘.", "점수 글자를 더 크게 해 줘."];
for (let i = 0; i < fixes; i++) {
  // 결과 턴이 대화에 붙을 때까지(워커가 1분마다 붙인다)
  for (let w = 0; w < 20; w++) { await new Promise((r) => setTimeout(r, 10_000)); const r = await fetch(`${SITE}/api/conversations/${conversationId}/work?since=1970-01-01`, { headers: { cookie } }); const j = (await r.json()) as { pending: number }; if (j.pending === 0) break; }
  const before = (await db.from("deliverables").select("id", { count: "exact", head: true }).eq("company_id", companyId)).count ?? 0;
  const t1 = Date.now();
  const f = await say(asks[i % asks.length]);
  console.log(`${hm()} 고치기 ${i + 1} 업무:`, f.assignment?.id?.slice(0, 8) ?? "없음");
  if (!f.assignment) break;
  while (Date.now() - t1 < 10 * 60_000) {
    await new Promise((r) => setTimeout(r, 15_000));
    const n = (await db.from("deliverables").select("id", { count: "exact", head: true }).eq("company_id", companyId)).count ?? 0;
    if (n > before) break;
  }
  // 184회차: 오른쪽 계획 카드에 "AI 고른 이유" 가 실렸나 — 실행의 decision.whyAi
  const { data: exq } = await db.from("work_executions").select("metrics_json").eq("assignment_id", f.assignment.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  console.log(`${hm()} 카드 줄: ${((exq?.metrics_json as { decision?: { whyAi?: string } } | null)?.decision?.whyAi) ?? "(없음)"}`);
  const { data: dd } = await db.from("deliverables").select("content_json").eq("assignment_id", f.assignment.id).maybeSingle();
  const cj = dd?.content_json as { seats?: { fix?: string; fixWhy?: string }; patched?: { changedLines: number; totalLines: number }; askJudge?: { verdict?: string }; loop?: { rounds: { met: number; unmet: number }[] } } | null;
  console.log(`${hm()} 고치기 ${i + 1}: 자리 ${cj?.seats?.fix ?? "?"} (${cj?.seats?.fixWhy ?? "?"}) · 바뀐 줄 ${cj?.patched ? `${cj.patched.changedLines}/${cj.patched.totalLines}` : "통째"} · 부탁 심판 ${cj?.askJudge?.verdict ?? "?"} · 고리 ${cj?.loop ? cj.loop.rounds.map((r) => `${r.met}/${r.met + r.unmet}`).join("→") : "-"} · ${Math.round((Date.now() - t1) / 1000)}초`);
}
