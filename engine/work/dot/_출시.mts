/**
 * 새 캐릭터를 켠다. 켜기 전에 **화면이 실제로 요구하는 것**을 센다.
 *
 * 처음엔 "사진 4장" 을 요구했는데 셋 다 0장이라 전부 막혔다. 그런데 화면을 열어 보니
 * `chats/page.tsx` 가 **사진이 없으면 얼굴로 대신 그린다.** 내 문이 앱보다 빡빡했던 것이다 —
 * 자가 길에 없는 것을 요구하면 멀쩡한 것이 막힌다(오늘만 두 번째다, pixelize 와 같은 병).
 * 그래서 재는 것을 바꾼다: **얼굴 여섯 개가 다 있나.** 그게 진짜 문이다.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
const { createServiceClient } = await import("../../../src/lib/supabase/service");
const db = createServiceClient();
const 켤것 = ["nabi", "haru", "yeonu"];
const { data } = await db.from("dot_characters").select("slug, name, tagline, is_public, photos, faces").in("slug", 켤것);
let 막힘 = 0;
for (const c of (data ?? []) as any[]) {
  const 얼굴 = Object.keys(c.faces ?? {}).filter((k) => !k.includes(":")).length;
  const 장수 = (c.photos ?? []).length;
  if (얼굴 < 6) { console.log(`**안 켠다** ${c.name} — 얼굴 ${얼굴}개(6개여야 한다)`); 막힘++; continue; }
  if (c.is_public) { console.log(`이미 켜짐 ${c.name}`); continue; }
  const { error } = await db.from("dot_characters").update({ is_public: true }).eq("slug", c.slug);
  console.log(error ? `**실패** ${c.name} — ${error.message}` : `켰다   ${c.name} · 얼굴 ${얼굴}개 · 사진 ${장수}장(없으면 얼굴로 나온다) · "${c.tagline}"`);
}
if (막힘) process.exitCode = 1;
const { data: 전부 } = await db.from("dot_characters").select("slug, name, is_public").eq("is_public", true).order("slug");
console.log(`\n공개된 캐릭터 ${(전부 ?? []).length}명: ${((전부 ?? []) as any[]).map((c) => c.name).join(" · ")}`);
