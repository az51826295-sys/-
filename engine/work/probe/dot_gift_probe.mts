/**
 * **크레딧과 선물** (10-28 사장님 "크레딧없는데 선물줄 수 있는거 고쳐").
 *   npx tsx engine/work/probe/dot_gift_probe.mts
 *
 * 화면만 보고 "단추가 안 꺼져 있다" 로 끝내지 않는다. 진짜로 **친밀도가 오르는지**가
 * 고장의 크기를 정한다 — 단추만 열려 있고 서버가 막으면 거슬리는 것이고,
 * 점수가 오르면 **파는 것을 공짜로 주고 있는 것**이다.
 *
 * 두 판을 다 본다. 막히는 것만 재면 **아무도 선물 못 하는 상태**도 통과시킨다 —
 * 실제로 10-28 에 `dot_spend_credits` 가 없어서 그 상태였다.
 *
 * ## 자가 두 번 틀렸다
 *
 * 1) 없는 선물 키("dessert")를 보내 놓고 "막혔다" 고 적을 뻔했다. 키는 `bond.ts` 에서 베껴 온다.
 * 2) 이유를 안 봤다. "막혔다" 와 "**크레딧이 모자라서** 막혔다" 는 다른 일이고,
 *    앞엣것만 재면 함수가 통째로 없어도 초록이 된다([[planted-fault-must-be-well-formed]]).
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const vars = JSON.parse(readFileSync(process.env.SCRATCH + "/dotvars.json", "utf8")) as Record<string, string>;
const URL_ = vars.NEXT_PUBLIC_SUPABASE_URL;
const ANON = vars.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SVC = vars.SUPABASE_SECRET_KEY;
const H = { apikey: SVC, authorization: "Bearer " + SVC, "content-type": "application/json" };
const BASE = "https://dot-web-production-7e03.up.railway.app";

const 선물키 = "saltbread", 선물값 = 10;     // bond.ts GIFTS 에서 베껴 온다

const a = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: 들어감, error: e1 } = await a.auth.signInAnonymously();
if (e1 || !들어감.user) { console.error("익명 로그인 실패:", e1?.message); process.exit(2); }
const uid = 들어감.user.id;
const token = 들어감.session!.access_token;
console.log("새 사람", uid.slice(0, 8), "— 크레딧 0에서 시작");

const 캐릭 = await (await fetch(`${URL_}/rest/v1/dot_characters?slug=eq.nabi&select=id`, { headers: H })).json() as { id: string }[];
const cid = 캐릭[0].id;

const 재기 = async () => {
  const b = await (await fetch(`${URL_}/rest/v1/dot_bonds?user_id=eq.${uid}&character_id=eq.${cid}&select=points`, { headers: H })).json() as { points: number }[];
  const w = await (await fetch(`${URL_}/rest/v1/dot_wallet?user_id=eq.${uid}&select=credits`, { headers: H })).json() as { credits: number }[];
  return { 친밀도: b[0]?.points ?? 0, 크레딧: w[0]?.credits ?? 0 };
};

async function 한판(이름: string, 미리줄크레딧: number) {
  if (미리줄크레딧 > 0) {
    await fetch(`${URL_}/rest/v1/dot_wallet`, {
      method: "POST", headers: { ...H, prefer: "resolution=merge-duplicates" },
      body: JSON.stringify([{ user_id: uid, credits: 미리줄크레딧 }]),
    });
  }
  const 전 = await 재기();
  const r = await fetch(`${BASE}/api/dot/chat/stream`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ characterId: cid, message: "선물", gift: 선물키 }),
  });
  const 줄들 = (await r.text()).split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l) as Record<string, unknown>; } catch { return null; } })
    .filter(Boolean) as Record<string, unknown>[];
  const 끝 = 줄들.find((x) => x.type === "done") ?? 줄들.find((x) => x.type === "error");
  await new Promise((r2) => setTimeout(r2, 1500));
  const 후 = await 재기();
  console.log(`\n── ${이름} ──`);
  console.log("서버:", String(끝?.reason ?? "ok"), "·", String(끝?.message ?? "").slice(0, 60));
  console.log(`친밀도 ${전.친밀도} → ${후.친밀도} · 크레딧 ${전.크레딧} → ${후.크레딧}`);
  return { 전, 후, 끝 };
}

let 나쁨 = 0;
const 재기판 = (n: string, ok: boolean) => { if (!ok) 나쁨++; console.log((ok ? "맞음  " : "어긋남") + " " + n); };

/* ① 크레딧 0 — 막혀야 하고, **이유가 분명해야** 한다. */
const a1 = await 한판("크레딧 0", 0);
재기판("친밀도가 안 오른다", a1.후.친밀도 === a1.전.친밀도);
재기판("이유가 '크레딧 모자람'이다(막연한 오류가 아니라)", a1.끝?.reason === "no_credits");

/* ② 크레딧 20 — 선물이 가고 값이 빠져야 한다. */
const a2 = await 한판("크레딧 20", 20);
재기판("친밀도가 오른다", a2.후.친밀도 > a2.전.친밀도);
재기판("값만큼 빠진다", a2.전.크레딧 - a2.후.크레딧 === 선물값);

console.log(나쁨 === 0 ? "\n전부 맞음" : `\n${나쁨}개 어긋남`);

/* 치운다 — 시험이 남긴 사람이 쌓이면 다음 사람이 숫자를 못 믿는다. */
const svc = createClient(URL_, SVC, { auth: { persistSession: false } });
await svc.auth.admin.deleteUser(uid).catch(() => {});
process.exit(나쁨 === 0 ? 0 : 1);
