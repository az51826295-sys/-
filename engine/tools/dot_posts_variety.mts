/**
 * # 게시물 다양성 재기  (11-09 사장님: *"게시물이 다양하지 않아"*)
 *
 *   npx tsx engine/tools/dot_posts_variety.mts            ← 지금 올라간 글을 사람별로 잰다
 *   npx tsx engine/tools/dot_posts_variety.mts --sabotage ← 자가 단조로움을 잡나 (심은 고장)
 *
 * 자는 `src/lib/dot/variety.ts`. 넷 다 낮을수록 다양하다.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const { measureVariety, 문턱 } = await import("../../src/lib/dot/variety");

/* ── 심은 고장: 같은 말만 쓴 묶음과 제각각인 묶음을 넣어 본다. 자가 앞엣것만 잡아야 한다. ── */
if (process.argv.includes("--sabotage")) {
  const 단조 = [
    "어, 오늘도 이불 속.", "어, 오늘은 옥상.", "어, 오늘도 게임.", "어, 오늘은 라면.", "어, 오늘도 늦잠.", "어, 오늘은 산책.",
  ];
  const 제각각 = [
    "라면 끓이다 불 냈다 진짜로", "시험 범위 왜 이렇게 넓지", "버스에서 할머니가 사탕 주심", "오늘 하늘 미쳤음", "손톱 깎다가 피남", "고양이가 내 의자 뺏었어",
  ];
  const a = measureVariety(단조), b = measureVariety(제각각);
  const 적기 = (이름: string, r: any) => console.log(`  ${이름.padEnd(5)} 첫머리 ${(r.같은첫머리 * 100).toFixed(0)}% · 소재겹침 ${r.소재겹침.toFixed(2)} → ${r.단조로운가 ? "단조롭다" : "제각각이다"}`);
  console.log(`심은 고장 — 같은 말만 쓴 묶음과 제각각인 묶음`);
  적기("단조", a); 적기("제각각", b);
  const 맞나 = a.단조로운가 && !b.단조로운가;
  console.log(맞나 ? `  ✅ 자가 가른다` : `  ❌ 자가 못 가른다 — 이 자는 못 쓴다`);
  process.exit(맞나 ? 0 : 1);
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const { data: cs } = await db.from("dot_characters").select("id, slug, name, photos").eq("is_public", true);
const { data: ps } = await db.from("dot_posts").select("character_id, caption, image_url, published_on").order("published_on", { ascending: false }).limit(500);
const 글들 = (ps ?? []) as any[];
console.log(`지금 올라간 글 ${글들.length}개 (${글들[글들.length - 1]?.published_on} ~ ${글들[0]?.published_on})`);
console.log(`문턱 — 같은첫머리 ${문턱.같은첫머리} · 소재겹침 ${문턱.소재겹침} · 사진반복 ${문턱.사진반복}\n`);
console.log(`이름  글수  똑같은글  같은첫머리  소재겹침  사진반복  판정`);
let 단조로운사람 = 0;
for (const c of (cs ?? []) as any[]) {
  const 내것 = 글들.filter((p) => p.character_id === c.id);
  const r = measureVariety(내것.map((p) => p.caption), 내것.map((p) => p.image_url));
  if (r.글수 < 2) { console.log(`${c.name.padEnd(4)} ${String(r.글수).padStart(4)}  글이 둘보다 적어 못 잼`); continue; }
  if (r.단조로운가) 단조로운사람++;
  console.log(
    `${c.name.padEnd(4)} ${String(r.글수).padStart(4)} ${(r.똑같은글 * 100).toFixed(0).padStart(8)}% ${(r.같은첫머리 * 100).toFixed(0).padStart(10)}% ` +
    `${r.소재겹침.toFixed(2).padStart(9)} ${(r.사진반복 * 100).toFixed(0).padStart(8)}%  ${r.단조로운가 ? `단조롭다 (${r.어긴것.join(" · ")})` : "제각각"}`,
  );
}
console.log(`\n단조로운 사람 ${단조로운사람}/${(cs ?? []).length}`);
