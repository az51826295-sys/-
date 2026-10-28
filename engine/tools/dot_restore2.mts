/**
 * **두근도트 복원 2판** (10-28). 10-24 이사에서 안 들어간 줄을 채운다.
 *   npx tsx engine/tools/dot_restore2.mts            ← 재기만 한다(안 쓴다)
 *   npx tsx engine/tools/dot_restore2.mts --진짜     ← 넣는다
 *
 * 10-24 에 쓴 `dot_restore.mts` 는 사람·말·게시물까지 갔는데, 재 보니 **친밀도(32)·
 * 팔로우(34)·턴(320)·사용량(65)이 통째로 0** 이고 말도 400/695 였다. 이사가 반만 간 것이다.
 *
 * ## SQL 편집기 없이 되는 이유
 *
 * `auth.users` 는 PostgREST 로 안 보이지만, `dot_*` 표는 **서비스 키로 보인다.**
 * 그래서 사람만 빼고는 전부 여기서 넣을 수 있다. 남는 것은 익명 사용자 몇 명과
 * **그들에게 달린 줄**뿐이고, 그건 외래키 때문에 사람이 먼저 들어가야 한다.
 *
 * ## 규율
 *
 * - **있는 사람에게 달린 줄만 넣는다.** 없는 사람 것을 밀어 넣으면 외래키가 거부하고,
 *   거부당한 줄 수를 안 세면 "넣었다" 고 적게 된다.
 * - `ON CONFLICT DO NOTHING` 에 해당하는 것은 `Prefer: resolution=ignore-duplicates`.
 *   두 번 돌려도 같은 결과여야 한다 — 복원은 한 번에 끝나는 일이 드물다.
 * - **재기가 기본이다.** `--진짜` 없이는 아무것도 안 쓴다.
 */
import { readFileSync } from "node:fs";

const 진짜 = process.argv.includes("--진짜");
const SCR = process.env.SCRATCH ?? "";
const vars = JSON.parse(readFileSync(SCR + "/dotvars.json", "utf8")) as Record<string, string>;
const URL_ = vars.NEXT_PUBLIC_SUPABASE_URL;
const KEY = vars.SUPABASE_SECRET_KEY;
const H = { apikey: KEY, authorization: "Bearer " + KEY, "content-type": "application/json" };

const dump = JSON.parse(readFileSync("engine/work/dot-이사/dot-dump.json", "utf8")) as Record<string, Record<string, unknown>[]>;

/** 지금 있는 사람 id — Auth 관리 API 로 읽는다(PostgREST 로는 auth 스키마가 안 보인다). */
async function 있는사람(): Promise<Set<string>> {
  const out = new Set<string>();
  for (let page = 1; page <= 20; page++) {
    const r = await fetch(`${URL_}/auth/v1/admin/users?page=${page}&per_page=100`, { headers: H });
    if (!r.ok) break;
    const j = (await r.json()) as { users?: { id: string }[] };
    const us = j.users ?? [];
    for (const u of us) out.add(u.id);
    if (us.length < 100) break;
  }
  return out;
}

async function 센다(t: string): Promise<number> {
  const r = await fetch(`${URL_}/rest/v1/${t}?select=*`, {
    headers: { ...H, range: "0-0", prefer: "count=exact" },
  });
  const cr = r.headers.get("content-range");
  return cr ? Number(cr.split("/")[1]) : -1;
}

/** 한 묶음 넣기. 겹치는 줄은 조용히 건너뛴다. */
async function 넣는다(t: string, rows: Record<string, unknown>[]): Promise<{ ok: number; 거부: string[] }> {
  const 거부: string[] = [];
  let ok = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const 조각 = rows.slice(i, i + 100);
    const r = await fetch(`${URL_}/rest/v1/${t}`, {
      method: "POST",
      headers: { ...H, prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify(조각),
    });
    if (r.ok) { ok += 조각.length; continue; }
    /* 묶음이 통째로 거부되면 **한 줄씩** 다시 해 본다 — 한 줄 때문에 99줄을 잃지 않는다.
       그리고 어느 줄이 왜 거부됐는지 적는다(안 적으면 "넣었다" 로 끝난다). */
    const why = (await r.text()).slice(0, 160);
    for (const row of 조각) {
      const r2 = await fetch(`${URL_}/rest/v1/${t}`, {
        method: "POST",
        headers: { ...H, prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify([row]),
      });
      if (r2.ok) ok++;
      else 거부.push(String(row.id ?? JSON.stringify(row).slice(0, 40)) + " ← " + (거부.length ? "" : why));
    }
  }
  return { ok, 거부 };
}

const 사람 = await 있는사람();
console.log(`지금 있는 사람 ${사람.size}명 · 덤프엔 ${dump.auth_users?.length ?? 0}명`);
const 없는사람 = (dump.auth_users ?? []).map((u) => String(u.id)).filter((id) => !사람.has(id));
if (없는사람.length) console.log(`**아직 없는 사람 ${없는사람.length}명** — 이들에게 달린 줄은 못 넣는다`);

/* 넣을 표. 순서가 있다 — 부모가 먼저다. */
const 표들 = ["dot_bonds", "dot_follows", "dot_usage", "dot_turns", "dot_messages",
              "dot_posts", "dot_post_likes", "dot_wallet", "dot_entitlements", "dot_purchases"];

console.log(`\n${"표".padEnd(20)} ${"덤프".padStart(5)} ${"지금".padStart(5)} ${"넣을것".padStart(6)}`);
const 할일: { t: string; rows: Record<string, unknown>[] }[] = [];
for (const t of 표들) {
  const rows = dump[t] ?? [];
  if (!rows.length) continue;
  const 지금 = await 센다(t);
  /* 사람에 달린 줄은 **그 사람이 있을 때만** 넣는다 */
  const 넣을것 = rows.filter((r) => {
    const uid = r.user_id;
    return typeof uid !== "string" || 사람.has(uid);
  });
  console.log(`${t.padEnd(20)} ${String(rows.length).padStart(5)} ${String(지금).padStart(5)} ${String(넣을것.length).padStart(6)}`
    + (넣을것.length < rows.length ? `   (${rows.length - 넣을것.length}줄은 없는 사람 것)` : ""));
  if (넣을것.length) 할일.push({ t, rows: 넣을것 });
}

if (!진짜) {
  console.log("\n**재기만 했다.** 넣으려면 `--진짜` 를 붙인다.");
  process.exit(0);
}

console.log("\n── 넣는다 ──");
for (const { t, rows } of 할일) {
  const 전 = await 센다(t);
  const { ok, 거부 } = await 넣는다(t, rows);
  const 후 = await 센다(t);
  console.log(`${t.padEnd(20)} ${전} → ${후} (+${후 - 전})`
    + (거부.length ? `  **거부 ${거부.length}줄**` : ""));
  if (거부.length) console.log("   " + 거부.slice(0, 3).join("\n   "));
}
