/**
 * **옛 프롬프트 vs 새 프롬프트** — 같은 사람·같은 날로 이레치를 둘 다 써 보고 자로 잰다.
 * DB 에는 아무것도 안 쓴다. (대조군 없이 "좋아졌다" 라고 하면 공을 지어내는 것이다.)
 *
 *   npx tsx engine/work/probe/dot_posts_ab.mts [날수]
 */
import { readFileSync, writeFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const { writeCaption, pickPhoto, pickPhotoLRU, pickTopic } = await import("../../../src/lib/dot/posts");
const { measureVariety } = await import("../../../src/lib/dot/variety");

const 날수 = Number(process.argv[2] ?? 7);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const { data: cs } = await db.from("dot_characters")
  .select("id, slug, name, persona, speech, formal_start, voice_ladder, photos").eq("is_public", true).order("slug");

const 날들: string[] = [];
for (let i = 0; i < 날수; i++) 날들.push(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10));

const 적을것: string[] = [];
console.log(`이름  옛: 첫머리 소재겹침 사진반복 | 새: 첫머리 소재겹침 사진반복`);
let 옛모두: string[] = [], 새모두: string[] = [];
for (const c of (cs ?? []) as any[]) {
  const photos = Array.isArray(c.photos) ? c.photos : [];
  if (!photos.length) { console.log(`${c.name.padEnd(4)} 사진이 없다 — 못 잼`); continue; }
  const 옛글: string[] = [], 옛사진: string[] = [], 새글: string[] = [], 새사진: string[] = [];
  for (const day of 날들) {
    const p옛 = pickPhoto(photos, day)!;
    옛사진.push(p옛.url);
    옛글.push(await writeCaption(c, p옛, { day, 옛방식: true }));

    const p새 = pickPhotoLRU(photos, [...새사진].reverse())!;
    새사진.push(p새.url);
    새글.push(await writeCaption(c, p새, { day, 최근글: [...새글].reverse(), 소재: pickTopic(c.slug, day) }));
  }
  const a = measureVariety(옛글, 옛사진), b = measureVariety(새글, 새사진);
  옛모두 = 옛모두.concat(옛글); 새모두 = 새모두.concat(새글);
  console.log(
    `${c.name.padEnd(4)} ${(a.같은첫머리 * 100).toFixed(0).padStart(8)}% ${a.소재겹침.toFixed(2).padStart(8)} ${(a.사진반복 * 100).toFixed(0).padStart(7)}% | ` +
    `${(b.같은첫머리 * 100).toFixed(0).padStart(7)}% ${b.소재겹침.toFixed(2).padStart(8)} ${(b.사진반복 * 100).toFixed(0).padStart(7)}%`,
  );
  적을것.push(`\n## ${c.name}\n### 옛\n${옛글.map((s) => `- ${s}`).join("\n")}\n### 새\n${새글.map((s) => `- ${s}`).join("\n")}`);
}
const A = measureVariety(옛모두), B = measureVariety(새모두);
console.log(`\n전체   옛: 첫머리 ${(A.같은첫머리 * 100).toFixed(0)}% · 소재겹침 ${A.소재겹침.toFixed(3)}`);
console.log(`       새: 첫머리 ${(B.같은첫머리 * 100).toFixed(0)}% · 소재겹침 ${B.소재겹침.toFixed(3)}`);
const 길 = "C:/Users/az518/Desktop/로키-도트/게시물-옛새.md";
writeFileSync(길, `# 게시물 옛 프롬프트 vs 새 프롬프트 (${날수}일치)\n${적을것.join("\n")}\n`);
console.log(길);
