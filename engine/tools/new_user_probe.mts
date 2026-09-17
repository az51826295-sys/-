/**
 * 새 사람이 가입해서 진짜로 일을 시킬 수 있는가 (135회차 09-16).
 *   npx tsx engine/tools/rookery_env.mts engine/tools/new_user_probe.mts [--say "주문"] [--keep]
 *
 * 사장님과 정한 다음 한 걸음은 **진짜 사용자 한 명**이다. 그런데 한 장짜리 소개를 쓰기 전에
 * 먼저 확인할 것이 있다 — **새 사람이 들어와서 실제로 결과물을 받는가.**
 * 이게 막혀 있으면 소개서를 아무리 잘 써도 첫 사람이 문 앞에서 닫는다.
 *
 * 지금까지 우리 시험은 전부 **이미 있는 회사**에 업무를 꽂아 넣었다(`bench_run.mts`). 그래서
 * 새 사람만 겪는 길은 한 번도 안 지나 봤다 — 실제로 126회차 시험판 8개가 전부 죽은 원인이
 * 그 길(지식 프로필)이었다. 이번엔 **처음부터** 간다: 계정 → 첫 대화 → 회사 자동 생성 →
 * 체험 크레딧 → 직원 고용 → 업무 → 결과물.
 *
 * 진짜 서버(`https://rookery.ai` 계열)에 **로그인한 채로** 말을 건다. 붙는 돈은 체험 크레딧 $1 안이다.
 * `--keep` 없으면 끝나고 시험 계정·회사를 지운다.
 */
const SAY = process.argv.includes("--say") ? process.argv[process.argv.indexOf("--say") + 1] : "안녕하세요. 로키가 뭘 해 줄 수 있는지 한 문단으로 알려 주세요.";
const KEEP = process.argv.includes("--keep");

const { createServiceClient } = await import("../../src/lib/supabase/service");
const { createClient: createAnon } = await import("@supabase/supabase-js");

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SITE = process.env.ROOKERY_SITE ?? "https://rookery.up.railway.app";
const ref = new globalThis.URL(SUPA_URL).hostname.split(".")[0];

const db = createServiceClient();
const email = `newuser-${Date.now()}@rookery.local`;
const password = `Probe-${Math.random().toString(36).slice(2)}!aA1`;

console.log(`시험 계정 ${email}`);
const { data: made, error: mkErr } = await db.auth.admin.createUser({ email, password, email_confirm: true });
if (mkErr) { console.error("계정 못 만듦:", mkErr.message); process.exit(1); }
const uid = made.user.id;

async function cleanup() {
  if (KEEP) { console.log(`\n(--keep) 시험 계정 남김: ${email}`); return; }
  const { data: co } = await db.from("companies").select("id").eq("owner_id", uid);
  for (const c of (co ?? []) as { id: string }[]) await db.from("companies").delete().eq("id", c.id);
  await db.auth.admin.deleteUser(uid);
  console.log("\n시험 계정·회사 지움");
}

try {
  // ── 1. 로그인해서 세션을 받는다 (사람이 하는 그대로)
  const anon = createAnon(SUPA_URL, ANON);
  const { data: sess, error: sErr } = await anon.auth.signInWithPassword({ email, password });
  if (sErr || !sess.session) throw new Error(`로그인 실패: ${sErr?.message}`);
  console.log("로그인 됨");

  // @supabase/ssr 은 세션을 `sb-<ref>-auth-token` 쿠키에 base64- 접두사로 넣는다.
  const s = sess.session;
  const payload = JSON.stringify({
    access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at,
    expires_in: s.expires_in, token_type: s.token_type, user: s.user,
  });
  const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(payload).toString("base64url")}`;

  // ── 2. 가입 직후 사람이 처음 하는 것: 그냥 말을 건다
  console.log(`\n말 걸기: "${SAY}"`);
  const t0 = Date.now();
  const res = await fetch(`${SITE}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ messages: [{ role: "user", content: SAY }] }),
  });
  console.log(`  HTTP ${res.status}`);
  if (!res.ok) { console.log("  " + (await res.text()).slice(0, 300)); throw new Error("대화 문이 안 열린다"); }
  const text = await res.text();
  const lines = text.split("\n").filter(Boolean);
  for (const l of lines.slice(-6)) console.log("  ⟩ " + l.slice(0, 220));
  console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)}초`);

  // ── 3. 새 사람에게 실제로 생겼어야 하는 것들
  const { data: co } = await db.from("companies").select("id, name, billing_mode").eq("owner_id", uid).maybeSingle();
  const C = co as { id: string; name: string; billing_mode: string } | null;
  console.log(`\n회사 자동 생성: ${C ? `있음 — "${C.name}" (${C.billing_mode})` : "**없음**"}`);
  if (!C) throw new Error("회사가 안 생겼다 — 새 사람은 아무 일도 못 맡긴다");

  const { data: led } = await db.from("credit_ledger").select("delta_usd, kind").eq("company_id", C.id);
  const credit = ((led ?? []) as { delta_usd: number }[]).reduce((a, b) => a + Number(b.delta_usd), 0);
  console.log(`체험 크레딧: $${credit.toFixed(2)} ${credit > 0 ? "" : "← **0 이면 첫 사람이 바로 막힌다**"}`);

  const { data: conv } = await db.from("conversations").select("id").eq("owner_id", uid);
  console.log(`대화 저장: ${(conv ?? []).length}건`);

  const { data: emp } = await db.from("company_employees").select("id, employees(name)").eq("company_id", C.id);
  console.log(`고용된 직원: ${(emp ?? []).length}명 ${(emp ?? []).map((e) => (e as { employees?: { name?: string } }).employees?.name).filter(Boolean).join(", ")}`);

  const { data: asg } = await db.from("assignments").select("id, title, status").eq("company_id", C.id);
  console.log(`업무: ${(asg ?? []).length}건 ${(asg ?? []).map((a) => `${(a as { title: string }).title.slice(0, 30)}(${(a as { status: string }).status})`).join(" · ")}`);
} catch (e) {
  console.error("\n**막혔다**:", (e as Error).message);
  process.exitCode = 1;
} finally {
  await cleanup();
}
