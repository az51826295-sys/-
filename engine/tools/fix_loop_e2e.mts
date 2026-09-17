/**
 * **1단계의 "끝" 시험을 기계가 먼저 해 본다** (169회차 09-18): 운영 서버에서 말로 게임을 만들고 말로 고친다.
 *   ROOKERY_DEMO_PASSWORD=… npx tsx engine/tools/rookery_env.mts engine/tools/fix_loop_e2e.mts [--fixes 1]
 *
 * 사장님 대화를 더럽히지 않게 **데모 계정**으로 한다(충전식 회사 — 크레딧이 실제로 빠진다, 판당 약 $0.2~0.4).
 * 화면이 하는 것과 같은 문(`/api/chat`)으로 들어간다 — 접수 → 계획 카드 → '시작' → 만들기 → 돌아옴 → "고쳐 줘" → 조각 고침 → 부탁 심판자.
 *
 * 재는 것(고칠 때마다): 새 파일이 생겼나 · 지난 파일의 몇 %가 바뀌었나 · 조각으로 고쳤나(`patched`) · 심판자가 뭐라 했나 ·
 * '시작' 을 또 물었나(작은 고침은 안 물어야 한다) · 몇 분 걸렸나.
 */
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

type Del = { id: string; created_at: string; content_json: { files?: { path: string; contents: string }[]; patched?: unknown; askJudge?: Record<string, unknown> | null; target?: string } };
async function deliverables(): Promise<Del[]> {
  const { data } = await db.from("deliverables").select("id, created_at, content_json").eq("company_id", companyId).eq("deliverable_type", "app_build").order("created_at", { ascending: true });
  return (data ?? []) as Del[];
}
/** 새 산출물이 생길 때까지 기다린다. 도중에 계획 카드가 '시작' 을 기다리면 알려 준다. */
async function waitForNew(before: number, assignmentId: string | null, maxMin = 14): Promise<{ del: Del | null; askedApproval: boolean; minutes: number }> {
  const t0 = Date.now(); let askedApproval = false;
  while (Date.now() - t0 < maxMin * 60_000) {
    await new Promise((r) => setTimeout(r, 15_000));
    const list = await deliverables();
    if (list.length > before) return { del: list[list.length - 1], askedApproval, minutes: Math.round((Date.now() - t0) / 6000) / 10 };
    if (assignmentId && !askedApproval) {
      const { data: a } = await db.from("assignments").select("status, role_input_json").eq("id", assignmentId).maybeSingle();
      const waiting = (a?.role_input_json as { awaitingApproval?: unknown } | null)?.awaitingApproval;
      if (waiting) { askedApproval = true; console.log(`${hm()} (계획 카드가 '시작' 을 기다린다 → '시작')`); await say("시작"); }
      if (a?.status === "failed") { console.log(`${hm()} 업무가 실패로 끝났다`); return { del: null, askedApproval, minutes: Math.round((Date.now() - t0) / 6000) / 10 }; }
    }
  }
  return { del: null, askedApproval, minutes: maxMin };
}

let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };

// ── 만든다 ──
const n0 = (await deliverables()).length;
const first = await say("브라우저에서 바로 열리는 벽돌깨기 게임을 HTML 파일 하나로 만들어 줘. 방향키로 막대를 움직이고, 점수가 보이고, 공을 놓치면 다시 시작할 수 있게.");
check("접수: 일이 생겼다", !!first.assignment, first.reply.slice(0, 120));
const made = await waitForNew(n0, first.assignment?.id ?? null);
check(`첫 판이 돌아왔다 (${made.minutes}분)`, !!made.del);
if (!made.del) { console.log(`\n본 줄 ${seen} · 어긋남 ${bad}`); process.exit(1); }
let prev = made.del;
console.log(`   첫 판: ${(prev.content_json.files ?? []).map((f) => `${f.path} ${f.contents.split("\n").length}줄`).join(", ")} · target ${prev.content_json.target}`);

// ── 고친다 ──
const FIXES = ["공이 너무 빨라. 속도를 절반으로 줄여 줘.", "막대가 너무 짧아. 1.5배로 길게.", "점수 글자가 작아서 안 보여. 두 배로 키워 줘.", "벽돌 색을 줄마다 다르게 해 줘.", "게임이 끝나면 '다시 하기' 단추가 화면 가운데 뜨게 해 줘."];
const want = Math.max(1, Math.min(FIXES.length, Number(process.argv[process.argv.indexOf("--fixes") + 1]) || 1));
for (let i = 0; i < want; i++) {
  console.log(`\n── 고침 ${i + 1}/${want}`);
  const before = (await deliverables()).length;
  const r = await say(FIXES[i]);
  check("접수: 고치는 일이 생겼다", !!r.assignment, r.reply.slice(0, 120));
  check("접수 답이 '다시 만들겠다' 고 하지 않는다", !/다시 만들|새로 만들|처음부터/.test(r.reply), r.reply.slice(0, 160));
  const w = await waitForNew(before, r.assignment?.id ?? null);
  check(`고친 판이 돌아왔다 (${w.minutes}분)`, !!w.del);
  if (!w.del) break;
  check("작은 고침에 '시작' 을 또 묻지 않았다", !w.askedApproval);
  const facts = changeFacts(prev.content_json.files ?? [], w.del.content_json.files ?? []);
  const total = facts.files.reduce((n, f) => n + f.before, 0), changed = facts.files.reduce((n, f) => n + f.removed, 0);
  console.log(`   새 파일 ${facts.newPaths.length} · 없어진 파일 ${facts.gonePaths.length} · ` + facts.files.map((f) => `${f.path} -${f.removed}/+${f.added} (${f.before}줄)`).join(" · "));
  check("새 파일을 안 만들었다", facts.newPaths.length === 0, facts.newPaths);
  check("지난 파일을 안 없앴다", facts.gonePaths.length === 0, facts.gonePaths);
  check(`바뀐 줄이 10% 이하 (${changed}/${total})`, total > 0 && changed / total <= 0.1);
  check("조각으로 고쳤다(patched 기록)", !!w.del.content_json.patched, w.del.content_json.patched ?? null);
  const j = w.del.content_json.askJudge;
  check("부탁 심판자가 봤다", !!j);
  if (j) console.log(`   심판자: [${j.verdict} · ${j.sizeMatch} · ${j.fixedTheThing}${j.sentBack ? " · 한 번 되돌림" : ""}] ${j.toPerson}`);
  prev = w.del;
}
console.log(`\n대화 ${conversationId} · 본 줄 ${seen} · 어긋남 ${bad}`);
process.exit(bad === 0 ? 0 : 1);
