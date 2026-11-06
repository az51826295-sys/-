/**
 * **두근도트 복원 — 내가 직접 넣는다** (10-26).
 *   npx tsx engine/tools/dot_restore.mts --시험    (한 명만, 되돌림)
 *   npx tsx engine/tools/dot_restore.mts --진짜
 *
 * 사장님: "두근도트 로그인창 일단 어캐해" → 로그인창이 고장난 게 아니다.
 * **계정이 0개**라 들어갈 사람이 없다. 덤프엔 22명·대화 695건이 다 있다.
 * 10-24 이사에서 `복원.sql` 을 만들어 놓고 안 붙였다.
 *
 * SQL 편집기는 사장님 손이지만 **관리 API 는 내 손이다.** 되는지부터 한 명으로 본다.
 *
 * ## 조심한 것
 *
 * - **id 를 그대로 보존해야 한다.** 대화·친밀도·결제가 전부 사용자 id 를 가리킨다.
 *   새 id 가 붙으면 695건이 주인 없는 줄이 된다([[truncated-id-became-a-new-game]] 와 같은 병).
 * - 비밀번호는 덤프에 없다(10-24 에 일부러 뺐다). 그래서 **비번 로그인은 못 되살린다** —
 *   구글로 들어오던 분만 그대로 들어온다. 이건 내가 고칠 수 있는 게 아니라 알려야 하는 사실이다.
 * - 이미 있는 줄은 건너뛴다. 두 번 돌려도 같아야 한다.
 */
import { readFileSync } from "node:fs";

const 시험 = process.argv.includes("--시험");
const 진짜 = process.argv.includes("--진짜");
if (!시험 && !진짜) { console.error("--시험 또는 --진짜 를 적어라."); process.exit(2); }

const k = JSON.parse(readFileSync("C:/Users/az518/Desktop/ai-workforce/.keys/dot-new.json", "utf8")) as
  { url: string; service: string };
const dump = JSON.parse(readFileSync("C:/Users/az518/Desktop/ai-workforce/engine/work/dot-이사/dot-dump.json", "utf8")) as
  Record<string, Record<string, unknown>[]>;

const 머리 = { apikey: k.service, authorization: "Bearer " + k.service, "content-type": "application/json" };

async function 사람넣기(u: Record<string, unknown>): Promise<{ ok: boolean; id?: string; why?: string }> {
  /* id 를 **같이 보낸다** — 받아 주는지가 이 시험의 핵심이다. */
  const 몸 = {
    id: u.id,
    email: u.email,
    email_confirm: true,
    user_metadata: u.raw_user_meta_data ?? {},
    app_metadata: u.raw_app_meta_data ?? {},
  };
  const r = await fetch(`${k.url}/auth/v1/admin/users`, {
    method: "POST", headers: 머리, body: JSON.stringify(몸), signal: AbortSignal.timeout(30_000),
  }).catch((e) => ({ status: 0, text: async () => String(e) } as unknown as Response));
  const t = await r.text();
  if (r.status === 200 || r.status === 201) {
    const made = JSON.parse(t) as { id?: string };
    return { ok: true, id: made.id };
  }
  /* 이미 있으면 성공으로 센다 — 두 번 돌려도 같아야 한다. */
  if (t.includes("already been registered") || t.includes("already exists")) return { ok: true, id: String(u.id) };
  return { ok: false, why: `${r.status} ${t.slice(0, 160)}` };
}

const 사람들 = dump.auth_users ?? [];
console.log(`덤프에 사람 ${사람들.length}명 · 대화 ${(dump.dot_messages ?? []).length}건`);

if (시험) {
  const 하나 = 사람들[0];
  if (!하나) { console.error("덤프에 사람이 없다."); process.exit(1); }
  console.log(`\n한 명만 넣어 본다 (id ${String(하나.id).slice(0, 8)}…)`);
  const r = await 사람넣기(하나);
  if (!r.ok) { console.log("실패:", r.why); console.log("\n→ 관리 API 로는 못 넣는다. SQL 편집기가 필요하다."); process.exit(1); }

  const 같나 = r.id === String(하나.id);
  console.log(`넣었다. 받은 id ${String(r.id).slice(0, 8)}… · **id 보존 ${같나 ? "됨" : "안 됨"}**`);

  /* 되돌린다 — 시험은 흔적을 남기지 않는다. */
  const d = await fetch(`${k.url}/auth/v1/admin/users/${r.id}`, { method: "DELETE", headers: 머리 });
  console.log(`되돌림: ${d.status === 200 ? "지웠다" : "못 지웠다 " + d.status}`);

  console.log(같나
    ? "\n→ **진짜 복원 가능하다.** `--진짜` 로 22명 + 대화 695건을 넣는다."
    : "\n→ id 가 안 보존된다. 그러면 대화 695건이 주인을 잃는다 — SQL 편집기로 가야 한다.");
  process.exit(같나 ? 0 : 1);
}

/* ── 진짜 복원 ── */
let 사람성공 = 0; const 사람탈: string[] = [];
for (const u of 사람들) {
  const r = await 사람넣기(u);
  if (r.ok && r.id === String(u.id)) 사람성공++;
  else 사람탈.push(`${String(u.id).slice(0, 8)}: ${r.why ?? "id 가 바뀌었다"}`);
}
console.log(`사람 ${사람성공}/${사람들.length}` + (사람탈.length ? `\n  탈: ${사람탈.slice(0, 5).join(" / ")}` : ""));

/** 넣는 순서가 있다 — 가리키는 쪽이 먼저 있어야 한다. */
const 순서 = ["dot_characters", "dot_wallet", "dot_entitlements", "dot_bonds", "dot_follows",
  "dot_character_follows", "dot_posts", "dot_post_likes", "dot_user_posts", "dot_user_post_likes",
  "dot_messages", "dot_turns", "dot_usage", "dot_purchases", "dot_push_subs"];

for (const 표 of 순서) {
  const 줄 = dump[표] ?? [];
  if (!줄.length) continue;
  let 넣음 = 0; let 탈: string | null = null;
  /* 묶어서 넣는다 — 695건을 한 줄씩 보내면 느리고 끊긴다. */
  for (let i = 0; i < 줄.length; i += 200) {
    const 묶음 = 줄.slice(i, i + 200);
    const r = await fetch(`${k.url}/rest/v1/${표}`, {
      method: "POST",
      /* 이미 있는 줄은 건너뛴다 — 두 번 돌려도 같아야 한다. */
      headers: { ...머리, prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify(묶음), signal: AbortSignal.timeout(120_000),
    }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) } as unknown as Response));
    if (r.ok) 넣음 += 묶음.length;
    else if (!탈) 탈 = `${r.status} ${(await r.text()).slice(0, 160)}`;
  }
  console.log(`${표.padEnd(22)} ${넣음}/${줄.length}` + (탈 ? ` · 탈: ${탈}` : ""));
}

console.log("\n비밀번호는 덤프에 없다(10-24 에 뺐다) — **비번으로 들어오던 분은 못 들어온다.** 구글 로그인은 그대로다.");
