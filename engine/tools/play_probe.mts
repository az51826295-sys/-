// 185회차 자: 게임 여는 문·패널 play·"파일 줘" 답 — 데모 계정, 실서버, 모델 0.
//   ROOKERY_DEMO_PASSWORD=… npx tsx engine/tools/rookery_env.mts engine/tools/play_probe.mts
const SITE = process.env.ROOKERY_SITE ?? "https://rookery-web-production.up.railway.app";
const EMAIL = "demo-rookery@rookery.local";
const PASSWORD = process.env.ROOKERY_DEMO_PASSWORD ?? "";
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
  return { reply, assignment: (done.assignment as { id: string; title: string } | null) ?? null, files: (done.files as unknown[] | null) ?? null };
}
let bad = 0;
const check = (n: string, ok: boolean, got?: unknown) => { if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)?.slice(0, 200)); };
// 데모 회사의 마지막 웹 게임 대화를 찾는다
const { data: dl } = await db.from("deliverables").select("id, title, assignment_id").eq("company_id", companyId).eq("deliverable_type", "app_build").order("created_at", { ascending: false }).limit(1);
const d = dl![0];
const { data: m } = await db.from("conversation_messages").select("conversation_id").contains("attachments", { returned: { deliverableId: d.id } }).limit(1).maybeSingle();
conversationId = m!.conversation_id as string;
console.log(`판: ${d.title} · 대화 ${conversationId.slice(0, 8)}`);
// 1) 게임 여는 문
const r1 = await fetch(`${SITE}/api/deliverables/${d.id}/play/`, { headers: { cookie } });
const body = await r1.text();
check("play 문 200", r1.status === 200, r1.status);
check("HTML 이 온다", /<html|<canvas|<script/i.test(body), body.slice(0, 80));
check("sandbox CSP", /sandbox/.test(r1.headers.get("content-security-policy") ?? ""), r1.headers.get("content-security-policy"));
check("남의 것은 401", (await fetch(`${SITE}/api/deliverables/${d.id}/play/`)).status === 401);
// 2) 패널이 play 를 준다
const r2 = await fetch(`${SITE}/api/conversations/${conversationId}/panel`, { headers: { cookie } });
const panel = (await r2.json()) as { current?: { play?: string | null; n: number }; versions: unknown[] };
check("패널 play 주소", !!panel.current?.play, panel.current);
// 3) "파일 줘" → 파일이 붙어 온다, 일은 안 만든다
const a = await say("아니 여기 파일로 올려줘");
const doneFiles = (a as unknown as { files?: unknown[] }).files;
check("파일 요청에 파일 붙음", Array.isArray(doneFiles) && doneFiles.length > 0, a.reply);
check("일을 안 만듦", !a.assignment, a.assignment);
console.log(bad ? `어긋남 ${bad}` : "전부 맞음");
