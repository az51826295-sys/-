/**
 * **쓰던 사람들이 오늘 바뀐 것에 다치지 않았나** (227회차 09-29). 모델 0 · 값 0.
 *
 * 09-29 에 채팅 목록을 **추가한(팔로우한) 사람만** 으로 바꿨다. 그런데 이미 쓰던 사람은
 * `dot_follows` 줄이 없을 수 있다 — 예전에는 팔로우 없이도 방이 다 보였기 때문이다.
 * 그러면 그분들은 **어제까지 있던 방이 오늘 사라진 것**으로 본다. 그건 기능이 아니라 사고다.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();

const { data: users } = await db.auth.admin.listUsers({ perPage: 500 });
const 사람 = (users.users ?? []).filter((u) => !String(u.email ?? "").startsWith("peek-"));
const { data: bs } = await db.from("dot_bonds").select("user_id, character_id");
const { data: fs } = await db.from("dot_follows").select("user_id, character_id");
const 사이 = new Map<string, Set<string>>(), 추가 = new Map<string, Set<string>>();
for (const b of (bs ?? []) as { user_id: string; character_id: string }[]) (사이.get(b.user_id) ?? 사이.set(b.user_id, new Set()).get(b.user_id)!).add(b.character_id);
for (const f of (fs ?? []) as { user_id: string; character_id: string }[]) (추가.get(f.user_id) ?? 추가.set(f.user_id, new Set()).get(f.user_id)!).add(f.character_id);

let 다침 = 0, 잃은방 = 0;
console.log(`계정 ${사람.length}명`);
for (const u of 사람) {
  const b = 사이.get(u.id) ?? new Set(), f = 추가.get(u.id) ?? new Set();
  const 사라진 = [...b].filter((c) => !f.has(c));
  if (!b.size) continue;                                   // 말 걸어 본 적 없으면 잃을 방도 없다
  if (사라진.length) {
    다침++; 잃은방 += 사라진.length;
    console.log(`  ${String(u.email ?? u.id).slice(0, 28).padEnd(28)} 말 건 방 ${b.size} · 추가 ${f.size} → **사라진 방 ${사라진.length}**`);
  }
}
console.log(다침 ? `\n**다친 사람 ${다침}명 · 사라진 방 ${잃은방}개**` : "\n다친 사람 없음");
if (process.argv.includes("--고쳐라") && 다침) {
  const 넣을것: { user_id: string; character_id: string }[] = [];
  for (const u of 사람) {
    const b = 사이.get(u.id) ?? new Set<string>(), f = 추가.get(u.id) ?? new Set<string>();
    for (const c of b) if (!f.has(c)) 넣을것.push({ user_id: u.id, character_id: c });
  }
  const { error } = await db.from("dot_follows").upsert(넣을것, { onConflict: "user_id,character_id" });
  console.log(error ? "못 고침: " + error.message : `**고쳤다** — 말 걸어 본 방 ${넣을것.length}개를 추가 목록에 넣었다.`);
}
