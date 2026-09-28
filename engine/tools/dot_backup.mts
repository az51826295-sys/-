/**
 * **지금 앱에 있는 도트를 통째로 내려받는다** (226회차 2026-09-28). 값 0.
 *
 *   npx tsx engine/tools/dot_backup.mts [폴더]
 *
 * 09-28: 앱의 도트 96장 중 **48장이 잘려 있고**, 바탕화면의 새 판들은 **0장**이다.
 * 그러니 올려서 고치면 되는데 — **덮어쓰기 전에 지금 것을 남긴다.**
 * 사장님이 전에 "옛것 먼저 내려받아 두라" 고 하셨고, [[cancel-is-not-recall]] 에서
 * 취소 한 번에 통과한 자산이 사라진 적이 있다. 되돌릴 길을 먼저 만든다.
 *
 * 내려받는 것: `dot_characters.sprites` 와 `faces` 의 모든 주소 + 그 표 자체(JSON).
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();

const 날 = new Date().toISOString().slice(0, 10);
const 뿌리 = process.argv[2] ?? `C:/Users/az518/Desktop/두근도트-백업-${날}`;
mkdirSync(뿌리, { recursive: true });

const { data, error } = await db.from("dot_characters").select("slug, name, sprites, faces").neq("slug", "test-plumbing");
if (error) { console.error("표를 못 읽었다 — 멈춘다:", error.message); process.exit(1); }
const chars = (data ?? []) as { slug: string; name: string; sprites: Record<string, string> | null; faces: Record<string, string> | null }[];

writeFileSync(`${뿌리}/_표.json`, JSON.stringify(chars, null, 1));
let 받음 = 0, 못받음 = 0;
for (const c of chars) {
  const dir = `${뿌리}/${c.slug}`;
  mkdirSync(dir, { recursive: true });
  const 것들: [string, string][] = [
    ...Object.entries(c.sprites ?? {}),
    ...Object.entries(c.faces ?? {}).map(([k, v]) => [`face-${k.replace(/:/g, "-")}`, v] as [string, string]),
  ];
  for (const [이름, url] of 것들) {
    try {
      const r = await fetch(url);
      if (!r.ok) { 못받음++; console.log(`  못 받음 ${c.slug}/${이름} HTTP ${r.status}`); continue; }
      writeFileSync(`${dir}/${이름}.png`, Buffer.from(await r.arrayBuffer()));
      받음++;
    } catch (e) {
      못받음++;
      console.log(`  못 받음 ${c.slug}/${이름} ${e instanceof Error ? e.message.slice(0, 50) : e}`);
    }
  }
  console.log(`${c.name}(${c.slug}) ${것들.length}장`);
}
console.log(`\n**${뿌리}**\n받은 것 ${받음}장${못받음 ? ` · 못 받은 것 ${못받음}장` : ""} · 표는 _표.json`);
console.log("되돌리려면 이 표의 주소를 그대로 다시 넣으면 된다.");
