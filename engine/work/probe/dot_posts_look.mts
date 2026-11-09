/** 지금 올라간 게시물이 얼마나 비슷한가 — 세기 전에 눈으로 본다. */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const { data: cs, error: e1 } = await db.from("dot_characters").select("id, slug, name, photos").eq("is_public", true);
if (e1) { console.log("캐릭터를 못 읽었다:", e1.message); process.exit(1); }
const { data: ps, error: e2 } = await db.from("dot_posts").select("character_id, caption, image_url, published_on").order("published_on", { ascending: false }).limit(300);
if (e2) { console.log("게시물을 못 읽었다:", e2.message); process.exit(1); }
const 글들 = (ps ?? []) as any[];
console.log(`게시물 ${글들.length}개 · ${글들[글들.length - 1]?.published_on} ~ ${글들[0]?.published_on}\n`);
console.log(`이름  글수  다른사진/가진사진  다른글`);
for (const c of (cs ?? []) as any[]) {
  const 내것 = 글들.filter((p) => p.character_id === c.id);
  const 사진 = new Set(내것.map((p) => p.image_url)), 글 = new Set(내것.map((p) => p.caption));
  console.log(`${c.name.padEnd(4)} ${String(내것.length).padStart(4)} ${String(사진.size).padStart(10)}/${String((c.photos ?? []).length).padStart(2)} ${String(글.size).padStart(9)}`);
}
console.log();
for (const p of 글들.slice(0, 20)) {
  const c = (cs as any[]).find((x) => x.id === p.character_id);
  console.log(`${p.published_on} ${(c?.name ?? "?").padEnd(4)} ${p.caption}`);
}
