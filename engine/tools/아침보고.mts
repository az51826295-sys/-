/**
 * **깨서 한 장만 보면 되는 것** (10-13). 모델 0 · 값 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/아침보고.mts
 *
 * 10-12~13 하루에 커밋이 23개 나왔고 보고가 길어졌다. 사장님은 고3이고 주말 두세 시간이다 —
 * **길면 안 읽힌다.** 그래서 긴 글 대신 **지금 상태를 장부에서 긁어 한 장으로** 낸다.
 *
 * 규칙 둘:
 *   · 숫자는 **전부 지금 긁은 것**이다. 기억으로 적지 않는다(10-12 에 그래서 틀렸다).
 *   · 지갑은 **내가 안 세고 문에게 묻는다**(09-26·10-12 에 두 번 같은 사고를 냈다).
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const 쪽 = (s: string) => `  ${s}`;
const 셈 = async (표: string, 날: number) => {
  const { count } = await db.from(표).select("*", { count: "exact", head: true })
    .gte("created_at", new Date(Date.now() - 날 * 864e5).toISOString());
  return count ?? 0;
};

console.log("\n══ 로키 ════════════════════════════════");
{
  const p = spawnSync("npx", ["tsx", "engine/tools/allowance_look.mts"], { encoding: "utf8", shell: true, env: process.env });
  for (const l of String(p.stdout ?? "").split("\n")) {
    const t = l.trim();
    if (!t || t.includes("[로키 DB]")) continue;
    if (/권혁수|로키 개발/.test(t) || t.startsWith("→")) console.log(쪽(t));
  }
}
console.log(쪽(`최근 7일 — 업무 ${await 셈("assignments", 7)} · 결과물 ${await 셈("deliverables", 7)} · 모델 호출 ${await 셈("model_usage", 7)}`));
{
  const { data } = await db.from("learning_candidates").select("status");
  const m: Record<string, number> = {};
  for (const r of (data ?? []) as { status: string }[]) m[r.status] = (m[r.status] ?? 0) + 1;
  console.log(쪽(`자가진화 후보 — ${Object.entries(m).map(([k, v]) => `${k} ${v}`).join(" · ")}`));
  console.log(쪽(`  (10-13부터 **못 잰 것은 pending** 으로 남아 사례가 쌓이면 다시 잰다)`));
}
{
  const { data } = await db.from("service_heartbeat").select("service, commit_sha, seen_at");
  const 머리 = spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).stdout.trim();
  /* 10-13: 첫 판이 "뒤처진 서비스 4개" 라 해서 놀랐는데, 그중 하나는 `practice_summary` —
     **서비스가 아니라 표시 줄**이었다. 그리고 나머지는 **도구·문서만 바뀐 커밋** 뒤였다.
     서버가 뒤처졌나는 **서버가 도는 코드(src/)가 바뀌었나**로 봐야 한다. */
  const 서비스만 = (data ?? []).filter((r: any) => /^(rookery|dot)-/.test(String(r.service)));
  const 뒤: string[] = [];
  for (const r of 서비스만 as any[]) {
    if (!r.commit_sha || r.commit_sha.startsWith(머리)) continue;
    const 바뀐 = spawnSync("git", ["diff", "--name-only", `${r.commit_sha}..HEAD`, "--", "src/"], { encoding: "utf8" }).stdout.trim();
    const n = spawnSync("git", ["rev-list", "--count", `${r.commit_sha}..HEAD`], { encoding: "utf8" }).stdout.trim();
    뒤.push(`${r.service} ${n}커밋 뒤${바뀐 ? " · **서버 코드 바뀜 — 올려야 한다**" : " (도구·문서만 — 안 올려도 된다)"}`);
  }
  console.log(쪽(`서버 — HEAD ${머리}`));
  for (const l of 뒤) console.log(쪽(`  ${l}`));
  if (!뒤.length) console.log(쪽("  전부 최신"));
}

console.log("\n══ 두근도트 ════════════════════════════");
{
  /* 10-13: 첫 판이 "말 0줄 · 마지막 사용 33일 전" 이라 했다. 같은 날 다른 자로 잰 값은
     **86줄 · 10-06** 이었다. 까닭은 **두근도트가 자기 Supabase 를 쓴다**는 것(09-11 기록) —
     나는 `rookery_env` 가 깔아 둔 로키 열쇠로 읽고 있었다. 로키 DB 에 `dot_*` 표가
     **있긴 해서**(옛 흔적) 오류도 안 났다. 그래서 **집을 찍어 따로 연다.** */
  const 도트환경: Record<string, string> = {};
  for (const l of readFileSync(".env.local", "utf8").split("\n")) {
    const i = l.indexOf("=");
    if (i > 0 && !l.trimStart().startsWith("#")) 도트환경[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
  const 집 = (u?: string) => (u ?? "").match(/https:\/\/([a-z0-9]+)\./)?.[1] ?? "";
  const 도트집 = 집(도트환경.NEXT_PUBLIC_SUPABASE_URL);
  const 로키집 = 집(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!도트집) { console.log(쪽("**못 잼** — .env.local 에서 두근도트 DB 주소를 못 찾았다")); }
  else if (도트집 === 로키집) { console.log(쪽(`**못 잼** — .env.local 이 로키 DB(${로키집})를 가리킨다. 두근도트 열쇠가 필요하다`)); }
  else await 두근(도트환경, 도트집);
}

async function 두근(환경: Record<string, string>, 집: string) {
  const db = createClient(환경.NEXT_PUBLIC_SUPABASE_URL!, 환경.SUPABASE_SECRET_KEY ?? 환경.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { count, error } = await db.from("dot_messages").select("*", { count: "exact", head: true })
    .gte("created_at", new Date(Date.now() - 14 * 864e5).toISOString());
  if (error) { console.log(쪽(`**못 잼** — 두근도트 DB(${집}) 를 못 읽었다: ${error.message}`)); return; }
  const 말 = count ?? 0;
  const { data: 알림 } = await db.from("dot_push_subs").select("user_id");
  const { data: 최근 } = await db.from("dot_messages").select("created_at").order("created_at", { ascending: false }).limit(1);
  const 지난 = 최근?.[0] ? Math.round((Date.now() - new Date(최근[0].created_at).getTime()) / 864e5) : null;
  console.log(쪽(`최근 14일 말 ${말}줄 · 마지막 사용 ${지난 === null ? "없음" : `${지난}일 전`}`));
  console.log(쪽(`**알림 켠 사람 ${new Set((알림 ?? []).map((a: any) => a.user_id)).size}명** ← 10-13에 대화 안으로 꺼냈다. 이 숫자가 오르면 먹힌 것이다`));
}

console.log("\n══ 사장님 손가락이 필요한 것 ════════════");
for (const l of [
  "① 두근도트에서 네 마디 주고받아 **알림 카드가 뜨는지**",
  "② 접수 자 정답표 15줄 — 깊게 켰어야 할 **번호만** (engine/data/gate-answers.json)",
  "③ 예측자 — 켤까 · 둘까 · 지울까 (한 번도 안 돌았다)",
  "④ 잿빛 테스터 12명 × 14일 (Play Console)",
]) console.log(쪽(l));
console.log("");
