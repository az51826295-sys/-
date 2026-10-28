/**
 * **표에 있는 글을 영어로 채운다** (10-28 사장님 "영어로").
 *   AI_PROVIDER=openai npx tsx engine/tools/dot_translate_content.mts          ← 재기만
 *   AI_PROVIDER=openai npx tsx engine/tools/dot_translate_content.mts --진짜   ← 넣는다
 *
 * 화면 글을 낱말표로 옮기고 나니 한글이 77%→42% 로 줄었고, **남은 것은 전부 표에서 오는 글**이다:
 * 캐릭터의 한 줄·첫 인사·추천 단어, 그리고 게시물 본문 156개.
 *
 * ## 번역이지 창작이 아니다
 *
 * 인물의 성격·분위기는 사장님 것이다([[creative-direction-is-users]]). 여기서 하는 일은
 * **같은 말을 영어로 옮기는 것**이고, 새 설정이나 없던 농담을 넣지 않는다. 그래서 모델에게
 * 원문을 주고 옮기게 하되 **길이와 결을 지키라고** 못 박는다.
 *
 * ## 이미 있는 것은 안 건드린다
 *
 * 두 번 돌려도 같은 결과여야 한다. 사람이 손본 번역을 모델이 되돌리면 안 된다.
 * 다시 하려면 그 줄의 영어 칸을 비우고 돌린다.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
import { z } from "zod";
import { defaultProviders } from "../../src/lib/execution/shared";

const 진짜 = process.argv.includes("--진짜");
const vars = JSON.parse(readFileSync(process.env.SCRATCH + "/dotvars.json", "utf8")) as Record<string, string>;
const URL_ = vars.NEXT_PUBLIC_SUPABASE_URL;
const KEY = vars.SUPABASE_SECRET_KEY;
const H = { apikey: KEY, authorization: "Bearer " + KEY, "content-type": "application/json" };
const ai = defaultProviders().ai;

const 규칙 = [
  "You translate Korean into English for a pixel-art chat app.",
  "- This is a translation, not a rewrite. Do not add facts, jokes, or personality that is not in the Korean.",
  "- Keep the length close to the original. These are chat bubbles and one-line captions, not paragraphs.",
  "- Keep the register: casual Korean becomes casual English, polite Korean stays warm and polite.",
  "- Keep the ellipses and the trailing quiet where the Korean has them — they are the character's voice.",
  "- Korean names stay as names, written in the Latin alphabet (나비 → Nabi).",
  "- Never explain, never add quotation marks that are not there.",
].join("\n");

/* ── 캐릭터: 한 줄 · 첫 인사 · 추천 단어 ── */
const 캐릭답 = z.object({
  tagline: z.string().describe("The one-line description, in English."),
  greeting: z.string().describe("The first thing they say, in English."),
  chips: z.array(z.string()).describe("The suggested opening lines, in English, same count and same order."),
});

type 캐릭 = { id: string; slug: string; name: string; tagline: string; greeting: string; chips: string[] | null; en: unknown };
const cr = await fetch(`${URL_}/rest/v1/dot_characters?select=id,slug,name,tagline,greeting,chips,en`, { headers: H });
if (!cr.ok) { console.error("캐릭터를 못 읽었다:", cr.status); process.exit(2); }
const 캐릭들 = (await cr.json()) as 캐릭[];

let 캐릭함 = 0, 캐릭건너뜀 = 0;
for (const c of 캐릭들) {
  if (c.slug === "test-plumbing") { 캐릭건너뜀++; continue; }
  if (c.en) { 캐릭건너뜀++; continue; }                     // 이미 있다 — 안 건드린다
  const out = await ai.generateStructuredOutput({
    systemInstructions: 규칙,
    input: [
      `Character: ${c.name} (${c.slug})`,
      `tagline: ${c.tagline}`,
      `greeting: ${c.greeting}`,
      `chips: ${JSON.stringify(c.chips ?? [])}`,
    ].join("\n"),
    schema: 캐릭답, schemaName: "dot_character_en", maxTokens: 1200, tier: "conversation",
  });
  const en = out.output;
  /* **개수가 달라지면 안 넣는다** — 추천 단어가 3개에서 2개가 되면 화면 한 칸이 빈다. */
  if (en.chips.length !== (c.chips ?? []).length) {
    console.log(`${c.slug.padEnd(8)} **추천 단어 개수가 다르다** ${(c.chips ?? []).length} → ${en.chips.length} — 안 넣는다`);
    continue;
  }
  console.log(`${c.slug.padEnd(8)} ${en.tagline}`);
  if (진짜) {
    const up = await fetch(`${URL_}/rest/v1/dot_characters?id=eq.${c.id}`, {
      method: "PATCH", headers: { ...H, prefer: "return=minimal" }, body: JSON.stringify({ en }),
    });
    if (!up.ok) { console.error(`  **못 넣었다** ${up.status} ${(await up.text()).slice(0, 120)}`); continue; }
  }
  캐릭함++;
}
console.log(`\n캐릭터 ${캐릭함}명 옮김 · ${캐릭건너뜀}명 건너뜀(이미 있거나 시험용)`);

/* ── 게시물 본문: 한 번에 여러 줄 (156개를 하나씩 부르면 값이 156배다) ── */
const 묶음답 = z.object({ lines: z.array(z.object({ id: z.number(), en: z.string() })) });
const pr = await fetch(`${URL_}/rest/v1/dot_posts?select=id,caption,caption_en&caption_en=is.null&order=id`, { headers: H });
if (!pr.ok) { console.error("게시물을 못 읽었다:", pr.status); process.exit(2); }
const 글들 = (await pr.json()) as { id: number; caption: string }[];
console.log(`\n영어가 없는 게시물 ${글들.length}개`);

const 덩이 = 12;
let 글함 = 0, 글빠짐 = 0;
for (let i = 0; i < 글들.length; i += 덩이) {
  const 조각 = 글들.slice(i, i + 덩이);
  const out = await ai.generateStructuredOutput({
    systemInstructions: 규칙 + "\nYou are given numbered captions. Return one English line for each id you were given — same ids, nothing left out.",
    input: 조각.map((p) => `${p.id}: ${p.caption}`).join("\n"),
    schema: 묶음답, schemaName: "dot_caption_en", maxTokens: 4000, tier: "conversation",
  });
  const 받음 = new Map(out.output.lines.map((l) => [l.id, l.en]));
  /* **보낸 수와 받은 수를 댄다.** 안 대면 조용히 빠진 줄이 영원히 한국어로 남는다
     ([[zero-can-mean-i-cannot-see]]). */
  const 빠진 = 조각.filter((p) => !받음.get(p.id));
  글빠짐 += 빠진.length;
  if (빠진.length) console.log(`  ${i}~: 보낸 ${조각.length} · 받은 ${조각.length - 빠진.length} — **${빠진.length}줄 빠짐**`);
  if (진짜) {
    for (const p of 조각) {
      const en = 받음.get(p.id);
      if (!en) continue;
      const up = await fetch(`${URL_}/rest/v1/dot_posts?id=eq.${p.id}`, {
        method: "PATCH", headers: { ...H, prefer: "return=minimal" }, body: JSON.stringify({ caption_en: en }),
      });
      if (up.ok) 글함++;
      else console.error(`  게시물 ${p.id} 못 넣음 ${up.status}`);
    }
  } else 글함 += 조각.length - 빠진.length;
  process.stdout.write(`  ${Math.min(i + 덩이, 글들.length)}/${글들.length}\r`);
}
console.log(`\n게시물 ${글함}개 옮김 · 빠진 줄 ${글빠짐}개`);
if (!진짜) console.log("\n**재기만 했다.** 넣으려면 `--진짜`.");
