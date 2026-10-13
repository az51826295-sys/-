/**
 * 두근도트 캐릭터·게시물의 영어·일본어 칸 채우기 (10-13, 사장님 "전세계화해줘 내앱").
 *
 *   npx tsx engine/tools/dot_i18n_fill.mts            # 보기만: 무엇이 비었나 센다(모델 0 · 값 0 · 쓰기 0)
 *   npx tsx engine/tools/dot_i18n_fill.mts --write    # 채운다(DeepSeek 싼 자리. 캐릭터 4명 + 게시물 최근 60개 ≈ 64번 부름)
 *   npx tsx engine/tools/dot_i18n_fill.mts --write --force   # 이미 있는 번역도 다시
 *
 * 먼저 supabase/schema_dot_i18n.sql 을 돌려야 한다(칸이 없으면 여기서 멈추고 그렇게 말한다).
 * 캐릭터 이름·소개·첫인사·고를 말·사진 설명과 게시물 한 줄은 DB 에만 있어 코드 사전으로 못 옮긴다.
 * 새 게시물은 올릴 때 posts.ts 가 같이 옮긴다 — 이 도구는 **이미 있는 것** 몫이다.
 */
import { readFileSync } from "node:fs";
import { z } from "zod";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { defaultProviders } = await import("../../src/lib/execution/shared");
const { translatePair } = await import("../../src/lib/dot/translate");
const { toVoiceLadder } = await import("../../src/lib/dot/bond");

const write = process.argv.includes("--write"), force = process.argv.includes("--force");
const db = createServiceClient();

type Row = { id: string; slug: string; name: string; tagline: string; greeting: string; chips: string[] | null; photos: { url: string; caption: string }[] | null; speech: string; formal_start: boolean; voice_ladder: string | null; i18n?: Record<string, unknown> };
const { data: chars, error } = await db.from("dot_characters").select("*").order("created_at", { ascending: true });
if (error) { console.error("캐릭터를 못 읽었다:", error.message); process.exit(1); }
const rows = (chars ?? []) as Row[];
if (rows.length && !("i18n" in rows[0])) {
  console.error("dot_characters.i18n 칸이 없다 — supabase/schema_dot_i18n.sql 을 먼저 돌려야 한다.");
  process.exit(1);
}

const one = z.object({ name: z.string(), tagline: z.string(), greeting: z.string(), chips: z.array(z.string()), photos: z.array(z.string()) });
const both = z.object({ en: one, ja: one });

let charDone = 0, charSkip = 0;
console.log(`── 캐릭터 ${rows.length}명`);
for (const c of rows) {
  const has = c.i18n && typeof c.i18n === "object" && "en" in c.i18n && "ja" in c.i18n;
  const src = { name: c.name, tagline: c.tagline ?? "", greeting: c.greeting ?? "", chips: c.chips ?? [], photos: (c.photos ?? []).map((p) => p.caption ?? "") };
  if (has && !force) { charSkip++; console.log(`  건너뜀 ${c.slug} (이미 있음)`); continue; }
  console.log(`  ${write ? "옮김" : "옮길 것"} ${c.slug}: 이름·소개·인사 + 고를 말 ${src.chips.length} + 사진 설명 ${src.photos.length}`);
  if (!write) continue;
  const polite = toVoiceLadder(c.voice_ladder, c.formal_start) === "polite";
  const out = await defaultProviders().ai.generateStructuredOutput({
    systemInstructions: [
      `채팅 앱 캐릭터 "${c.name}" 의 화면 글을 영어와 일본어로 옮긴다. 같은 모양(JSON)으로 돌려준다 — 배열은 **같은 길이·같은 순서**.`,
      c.speech ? `이 인물의 말투: ${c.speech}` : "",
      `- name: 한국 이름을 영어는 로마자(예: 유나 → Yuna, 서하 → Seoha), 일본어는 가타카나(ユナ, ソハ)로. 뜻으로 옮기지 않는다.`,
      `- tagline: 고르는 화면의 한 줄 소개. 짧게.`,
      `- greeting: 처음 여는 말. 인물 말투 그대로 — ${polite ? "정중하게(영어 공손, 일본어 です・ます)" : "편하게(영어 친구 말투, 일본어 タメ口)"}.`,
      `- chips: 사람이 캐릭터에게 누를 첫마디(사람 쪽 말). 짧고 자연스럽게.`,
      `- photos: 사진 설명. 짧은 장면 설명.`,
      "- 직역보다 그 언어를 쓰는 사람에게 자연스러운 글. 웃음 표시는 그 언어 식(ㅋㅋ → lol / 笑). 없는 내용은 더하지 않는다.",
    ].filter(Boolean).join("\n"),
    input: JSON.stringify(src),
    schema: both, schemaName: "dot_character_i18n", maxTokens: 2000, tier: "conversation",
  });
  const fix = (x: z.infer<typeof one>) => ({ ...x, chips: x.chips.length === src.chips.length ? x.chips : [], photos: x.photos.length === src.photos.length ? x.photos : [] });
  const i18n = { en: fix(out.output.en), ja: fix(out.output.ja) };
  for (const l of ["en", "ja"] as const) if (!i18n[l].chips.length && src.chips.length) console.log(`    ⚠ ${l} 고를 말 개수가 달라 비웠다(화면은 한국어로)`);
  const { error: e } = await db.from("dot_characters").update({ i18n }).eq("id", c.id);
  if (e) { console.log(`    ✗ 저장 실패: ${e.message}`); continue; }
  charDone++;
  console.log(`    → ${i18n.en.name} / ${i18n.ja.name} · "${i18n.en.greeting}" / "${i18n.ja.greeting}"`);
}

const limit = Number(process.argv.find((a) => a.startsWith("--posts="))?.slice(8) ?? 60);
const { data: posts } = await db.from("dot_posts").select("*").order("id", { ascending: false }).limit(limit);
const byId = new Map(rows.map((c) => [c.id, c]));
let postDone = 0, postSkip = 0, postFail = 0;
const todo = ((posts ?? []) as { id: number; caption: string; character_id: string; i18n?: Record<string, unknown> }[])
  .filter((p) => { const has = p.i18n && "en" in p.i18n && "ja" in p.i18n; if (has && !force) postSkip++; return force || !has; });
console.log(`\n── 게시물 최근 ${limit}개 중 옮길 것 ${todo.length} · 이미 있음 ${postSkip}`);
if (write) for (const p of todo) {
  const c = byId.get(p.character_id);
  if (!c) continue;
  try {
    const i18n = await translatePair(p.caption, { name: c.name, speech: c.speech, polite: toVoiceLadder(c.voice_ladder, c.formal_start) === "polite" }, "SNS 게시물 한 줄");
    const { error: e } = await db.from("dot_posts").update({ i18n }).eq("id", p.id);
    if (e) throw new Error(e.message);
    postDone++;
  } catch (e) { postFail++; console.log(`  ✗ #${p.id}: ${e instanceof Error ? e.message : e}`); }
}

console.log(`\n${write ? "채움" : "보기만(--write 로 채운다)"} — 캐릭터 ${charDone}/${rows.length} (건너뜀 ${charSkip}) · 게시물 ${postDone}/${todo.length} (실패 ${postFail})`);
