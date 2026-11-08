/**
 * 통에 지금 들어 있는 스프라이트를 **통째로 바탕화면에 내려 받는다.** 덮어쓰기 전에 되돌릴 자리를 만든다.
 * (`upsert: true` 로 올리면 예전 것이 사라진다. 올리기 전에 이걸 먼저 돌린다.)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const 나갈곳 = "C:/Users/az518/Desktop/로키-도트/백업-통-20261109";
mkdirSync(나갈곳, { recursive: true });
const { data } = await db.from("dot_characters").select("slug, name, sprites, is_public");
let 받음 = 0, 실패 = 0;
for (const c of (data as any[]).filter((x) => x.is_public && x.sprites)) {
  mkdirSync(join(나갈곳, c.slug), { recursive: true });
  for (const [감정, url] of Object.entries(c.sprites as Record<string, string>)) {
    const r = await fetch(url as string);
    if (!r.ok) { console.log(`  ✗ ${c.slug} ${감정} ${r.status}`); 실패++; continue; }
    writeFileSync(join(나갈곳, c.slug, `${감정.replace(":", "-")}.png`), Buffer.from(await r.arrayBuffer()));
    받음++;
  }
}
console.log(`받음 ${받음}칸 · 못 받음 ${실패}칸 → ${나갈곳}`);
