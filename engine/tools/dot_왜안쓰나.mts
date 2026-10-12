/**
 * **두근도트를 왜 아무도 안 쓰나** (10-12 사장님 주제). 모델 0 · 값 0.
 *   npx tsx engine/tools/dot_왜안쓰나.mts [일수=60]
 *
 * 짐작으로 답하면 안 된다. **어디서 끊기는지**를 장부에서 센다:
 *   들어옴 → 캐릭터를 고름(팔로우) → 첫 말을 검 → **둘째 날에 다시 옴**
 * 사람이 적으면 비율은 뜻이 없으므로 **머릿수를 그대로** 적는다
 * (5명 중 1명이 60% 가 아니라 "1명" 이다 — 10-11 교훈).
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const 일수 = Number(process.argv[2] ?? 60);
const 부터 = new Date(Date.now() - 일수 * 864e5).toISOString();
const 한국 = (t: string) => new Date(new Date(t).getTime() + 9 * 3600e3).toISOString().slice(0, 10);

async function 전부(표: string, 칸: string, 언제칸 = "created_at") {
  const 들: any[] = [];
  for (let 쪽 = 0; ; 쪽++) {
    const { data, error } = await db.from(표).select(칸).gte(언제칸, 부터)
      .order(언제칸, { ascending: true }).range(쪽 * 1000, 쪽 * 1000 + 999);
    if (error) { console.log(`  (${표} 못 읽음: ${error.message.slice(0, 50)})`); return null; }
    들.push(...(data ?? []));
    if (!data || data.length < 1000) return 들;
    if (쪽 > 30) return 들;
  }
}

const 말 = (await 전부("dot_messages", "user_id,role,created_at")) ?? [];
const 팔로우 = (await 전부("dot_follows", "user_id,created_at")) ?? [];
const 인연 = (await 전부("dot_bonds", "user_id,created_at")) ?? [];
const 알림 = (await 전부("dot_push_subs", "user_id,created_at")) ?? [];

/** 사람마다: 처음 온 날 · 마지막 날 · 말한 날 수 · 말한 줄 수 */
type 사람 = { 첫: string; 끝: string; 날들: Set<string>; 줄: number };
const 사람들 = new Map<string, 사람>();
const 넣 = (id: string, t: string, 줄: boolean) => {
  const r = 사람들.get(id) ?? { 첫: t, 끝: t, 날들: new Set<string>(), 줄: 0 };
  if (t < r.첫) r.첫 = t;
  if (t > r.끝) r.끝 = t;
  if (줄) { r.날들.add(한국(t)); r.줄++; }
  사람들.set(id, r);
};
for (const m of 말) if (m.role === "user") 넣(m.user_id, m.created_at, true);
for (const f of 팔로우) 넣(f.user_id, f.created_at, false);
for (const b of 인연) 넣(b.user_id, b.created_at, false);

const 전체 = [...사람들.entries()];
const 말한사람 = 전체.filter(([, r]) => r.줄 > 0);
const 이틀이상 = 말한사람.filter(([, r]) => r.날들.size >= 2);
const 알림켠 = new Set(알림.map((a: any) => a.user_id));

console.log(`최근 ${일수}일 — 두근도트 "왜 안 쓰나"\n`);
console.log("  ── 깔때기 (머릿수 그대로)");
console.log(`     흔적을 남긴 사람            ${전체.length}명`);
console.log(`     캐릭터를 고른 사람(팔로우)   ${new Set(팔로우.map((f: any) => f.user_id)).size}명`);
console.log(`     **말을 한 번이라도 건 사람** ${말한사람.length}명`);
console.log(`     **이틀 이상 온 사람**        ${이틀이상.length}명`);
console.log(`     알림을 켠 사람               ${알림켠.size}명`);

console.log("\n  ── 사람마다 (처음 → 마지막 · 말한 날 수 · 줄 수)");
for (const [id, r] of 전체.sort((a, b) => b[1].줄 - a[1].줄)) {
  const 지난 = Math.round((Date.now() - new Date(r.끝).getTime()) / 864e5);
  console.log(`     ${id.slice(0, 8)}  ${한국(r.첫)} → ${한국(r.끝)}`
    + `  날 ${String(r.날들.size).padStart(2)} · 줄 ${String(r.줄).padStart(3)}`
    + `  ${지난}일 전까지${알림켠.has(id) ? " · 알림 켬" : ""}`);
}

/* **하루에 몇 줄이나 거는가** — 하루 제한에 걸려서 안 오는 것인지 본다.
   제한에 걸린 적이 없다면 "모자라서 안 온다" 는 설명이 아니다. */
const 날별 = new Map<string, number>();
for (const m of 말) if (m.role === "user") { const d = 한국(m.created_at); 날별.set(d, (날별.get(d) ?? 0) + 1); }
const 최대 = Math.max(0, ...날별.values());
/* **사람마다 하루에 몇 줄인가** — 합쳐 센 94줄은 여러 사람이 섞인 것이라
   "제한에 닿았나" 를 못 말한다. 제한은 **한 사람 하루 30줄**이다(FREE_TURNS_PER_DAY). */
const 사람날 = new Map<string, number>();
for (const m of 말) if (m.role === "user") { const k = `${m.user_id}|${한국(m.created_at)}`; 사람날.set(k, (사람날.get(k) ?? 0) + 1); }
const 한사람최대 = Math.max(0, ...사람날.values());
const 닿은 = [...사람날.values()].filter((n) => n >= 30).length;
console.log(`\n  ── 하루에 사람이 건 말: 가장 많은 날 ${최대}줄`);
console.log(`     한 사람이 하루에 건 말: 가장 많은 것 ${한사람최대}줄 · **제한(30)에 닿은 날 ${닿은}번**`);
console.log(닿은
  ? `     → 제한에 닿은 적이 있다. "더 하고 싶은데 못 한다" 가 이유일 수 있다.`
  : `     → **한 번도 제한에 안 닿았다.** "횟수가 모자라서 안 온다" 는 설명이 안 된다.`);
