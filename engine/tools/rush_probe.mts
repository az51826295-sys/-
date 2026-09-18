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
const a1 = await say("터치로 하는 두더지 잡기 게임 HTML 한 파일로 만들어 줘. 20초 제한, 점수 표시.");
console.log(`${hm()} 업무:`, a1.assignment?.id?.slice(0, 8) ?? "없음");
const a2 = await say("시작");
const a3 = await say("만들어");
console.log(`${hm()} 업무 수(기대 1):`, await countJobs(), "| 업무 붙음?", !!a2.assignment, !!a3.assignment);
const t0 = Date.now();
let finished = false;
while (Date.now() - t0 < 6 * 60_000) {
  await new Promise((r) => setTimeout(r, 15_000));
  const { data: a } = await db.from("assignments").select("status").eq("id", a1.assignment!.id).single();
  if (["completed", "submitted"].includes(a!.status)) { finished = true; break; }
  if (["failed", "cancelled"].includes(a!.status)) { console.log("업무 실패:", a!.status); break; }
}
console.log(`${hm()} 결과 ${finished ? "나옴" : "안 나옴"} · ${Math.round((Date.now() - t0) / 6000) / 10}분 · 업무 수 최종`, await countJobs());
const { data: ex } = await db.from("work_executions").select("status, current_step").eq("assignment_id", a1.assignment!.id);
console.log("실행:", JSON.stringify(ex));
