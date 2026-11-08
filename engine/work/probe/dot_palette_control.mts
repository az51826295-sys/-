/**
 * **대조군** — "색표가 사람마다 따로라서 제각각으로 보인다"가 맞나.
 *
 * 기준점으로 삼은 **피드**는 사장님 눈에 한 결로 보인다. 그 피드의 색 겹침이 스프라이트와
 * 같다면, 겹침은 "제각각"의 원인이 아니다. 자를 먼저 의심한다. 11-08.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const { usedColors, paletteOverlap } = await import("../../../src/lib/dot/palette");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data } = await db.from("dot_characters").select("slug, name, photos, sprites, is_public");
const 공개 = (data as any[]).filter((c) => c.is_public).sort((a, b) => a.slug.localeCompare(b.slug));

async function 모은색(주소들: string[]) {
  const s = new Set<string>();
  for (const u of 주소들) {
    const r = await fetch(u); if (!r.ok) continue;
    for (const q of await usedColors(Buffer.from(await r.arrayBuffer()))) s.add(q);
  }
  return s;
}

const 피드색 = new Map<string, Set<string>>();
const 칸색 = new Map<string, Set<string>>();
for (const c of 공개) {
  const ps: any[] = Array.isArray(c.photos) ? c.photos : c.photos ? Object.values(c.photos) : [];
  피드색.set(c.name, await 모은색(ps.map((p: any) => (typeof p === "string" ? p : p?.url)).filter(Boolean)));
  칸색.set(c.name, await 모은색(Object.values((c.sprites ?? {}) as Record<string, string>)));
}

function 평균겹침(표: Map<string, Set<string>>) {
  const 이름 = [...표.keys()]; let 합 = 0, n = 0;
  for (let i = 0; i < 이름.length; i++) for (let j = i + 1; j < 이름.length; j++) {
    합 += paletteOverlap(표.get(이름[i])!, 표.get(이름[j])!); n++;
  }
  return { 평균: 합 / n, 쌍: n };
}
const 피 = 평균겹침(피드색), 칸 = 평균겹침(칸색);
console.log(`피드(사장님이 "한 결"이라 한 것)  평균 겹침 ${(피.평균 * 100).toFixed(1)}%  (${피.쌍}쌍)`);
console.log(`스프라이트("제각각"이라 한 것)    평균 겹침 ${(칸.평균 * 100).toFixed(1)}%  (${칸.쌍}쌍)`);
console.log(
  피.평균 < 0.05 && 칸.평균 < 0.05
    ? `\n자가 틀렸다 — 한 결인 쪽도 겹침이 0 이다. 색 겹침은 "제각각"의 원인이 아니다.`
    : `\n겹침이 갈린다 — 색표가 원인일 수 있다.`,
);
