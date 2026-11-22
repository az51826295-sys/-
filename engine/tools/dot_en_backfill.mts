// 영어 칸 메우기(11-22 "다 영어로"): ① 게시물 caption_en 빈 것 ② 캐릭터 en(tagline·greeting·chips) 없는 것.
// 이미 있는 것은 건드리지 않는다(두 번 돌려도 안전). --dry 면 적지 않고 보여만 준다.
// npx tsx engine/tools/dot_en_backfill.mts [--dry]
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]));
for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v;
const { toEnglish } = await import("../../src/lib/dot/translate");
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const dry = process.argv.includes("--dry");

// ① 게시물
const { data: posts } = await db.from("dot_posts").select("id, caption, caption_en, dot_characters(slug)").order("id", { ascending: false });
const 빈 = ((posts ?? []) as unknown as { id: number; caption: string; caption_en: string | null; dot_characters: { slug: string } | null }[])
  .filter((p) => !(p.caption_en ?? "").trim() && p.caption.trim());
console.log("posts missing English:", 빈.length);
let 적음 = 0;
for (let i = 0; i < 빈.length; i += 20) {
  const 묶음 = 빈.slice(i, i + 20);
  const en = await toEnglish(묶음.map((p) => ({ text: p.caption, who: p.dot_characters?.slug })));
  for (let k = 0; k < 묶음.length; k++) {
    if (!en[k]) continue;
    if (i === 0 && k < 4) console.log(`  ${묶음[k].caption}  →  ${en[k]}`);
    if (!dry) { const { error } = await db.from("dot_posts").update({ caption_en: en[k] }).eq("id", 묶음[k].id); if (!error) 적음++; }
  }
}
console.log("posts written:", 적음);

// ② 캐릭터
const { data: chars } = await db.from("dot_characters").select("id, slug, tagline, greeting, chips, en, is_public").eq("is_public", true);
for (const c of (chars ?? []) as { id: string; slug: string; tagline: string; greeting: string; chips: unknown[]; en: unknown }[]) {
  if (c.en) continue;
  const chipTexts = (c.chips ?? []).map((x) => (typeof x === "string" ? x : String((x as { text?: string; label?: string }).text ?? (x as { label?: string }).label ?? ""))).filter(Boolean);
  const src = [c.tagline, c.greeting, ...chipTexts];
  const en = await toEnglish(src.map((text) => ({ text, who: c.slug })));
  const value = { tagline: en[0], greeting: en[1], chips: en.slice(2) };
  console.log(c.slug, JSON.stringify(value));
  if (!dry) await db.from("dot_characters").update({ en: value }).eq("id", c.id).is("en", null);
}
