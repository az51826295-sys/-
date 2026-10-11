/**
 * **구간마다 전투 배경을 뽑는다** (10-11 사장님 "그림 다 넣었어?"). 모델: gpt-image-2.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/ash_구간배경.mts [이름…] [--진짜]
 *
 * 10-11 에 세어 보니 **전투 배경이 `tower.png` 하나였다** — 1층부터 100층까지,
 * 구간 여덟(하수도·광산·회랑·성소·늪·대장간·빙벽·심연)이 전부 같은 돌복도에서 싸웠다.
 * 구간 이름을 여덟 개 지어 놓고 그림은 하나였으니, 터를 바꾼 뜻이 화면에 없었다.
 *
 * **틀**: 게임은 396×168 도트로 그리고, 캐릭터 발이 아래에서 16 CSS px 자리에 선다 —
 * 그래서 **바닥이 그림의 아래 29%** 여야 발이 바닥 위에 놓인다(그리기() 주석과 같은 값).
 * 모델은 3:2(1536×1024)로 받아, **아래쪽 651줄만 잘라** 그 비율을 만든다.
 * 그래서 주문에는 "바닥은 아래 18%" 라고 적는다 — 자르고 나면 29% 가 된다.
 */
import sharp from "sharp";
import { writeFileSync, mkdirSync, appendFileSync } from "node:fs";

const 진짜 = process.argv.includes("--진짜");
const 칸 = "C:/Users/az518/Desktop/로키-도트/배경";
const 게임 = "public/ash/art";
mkdirSync(칸, { recursive: true });

const 결 = [
  "Style: 16-bit SNES JRPG pixel art background, thick dark outlines, flat shading, limited desaturated palette.",
  "Every pixel a clear square block. Grim, worn, dusty — faded colors, dirty textures, nothing shiny, nothing neon.",
  "A wide side-on view of an empty room, like a fighting stage: the back wall fills the upper part,",
  "and the FLOOR is a flat horizontal strip across the BOTTOM 18% of the image, unobstructed edge to edge.",
  "Absolutely NO characters, no monsters, no people, no text, no UI, no frames, no borders.",
  "Nothing glows green, no modern objects, no electric lights.",
].join(" ");

/** 구간들 의 `터` 와 같은 순서. 키가 곧 게임이 찾는 그림 이름이다. */
const 터들: Record<string, { 이름: string; 말: string }> = {
  "bg-sewer":  { 이름: "1구간 습한 지하 하수도",
    말: "A damp underground sewer: curved brick walls stained dark with water, a low arched tunnel mouth, iron grates, dripping pipes of old stone, shallow murky water pooling along the base of the wall, patches of pale mold. Cold greys and sick green-browns." },
  "bg-mine":   { 이름: "2구간 버려진 광산",
    말: "An abandoned mine gallery: rough hewn rock walls with timber support beams and planks, a collapsed side shaft, an overturned ore cart, scattered pickaxes and broken crates, a few dim hanging lanterns with weak warm light. Browns, dusty greys, coal black." },
  "bg-hall":   { 이름: "3구간 통곡의 고탑 회랑",
    말: "A high tower corridor: tall cut-stone walls with narrow pointed arches, worn stone statues in alcoves with their faces broken off, tattered colorless banners, iron sconces with low flames, dust hanging in the air. Cold grey stone, faded cloth." },
  "bg-sanctum":{ 이름: "4구간 침묵의 성소",
    말: "A fallen sanctum: pale stone walls with carved panels whose writing has been chiselled away, a cracked altar against the back wall, toppled candle stands, a torn hanging veil, drifts of fine dust. Washed-out cream and bone white, dull tarnished brass." },
  "bg-swamp":  { 이름: "5구간 맹독의 지하 늪",
    말: "An underground poison swamp: a cavern wall furred with wet moss and dripping roots, thick olive-brown sludge pooling across the base, dead reeds and half-sunk bones, slow bubbles, hanging strands of slime. Sickly greens and wet browns." },
  "bg-forge":  { 이름: "6구간 용암의 대장간",
    말: "A vast underground forge: soot-blackened stone walls, huge cold anvils and racks of unfinished blades, a great stone furnace mouth with a deep DIM orange glow inside, cooled slag and ash heaped along the base, thin smoke. Blacks, iron greys, a faint dull ember orange — never bright." },
  "bg-ice":    { 이름: "7구간 서리발의 빙벽",
    말: "An ice wall chamber: a towering wall of cloudy pale blue ice with frozen cracks and things dimly frozen inside it, heavy frost crusting the stone at the sides, hanging icicles, a floor of packed snow and ice. Muted pale blues, bone white, grey — dull, not sparkling." },
  "bg-abyss":  { 이름: "8구간 심연의 문",
    말: "The abyss gate: a vast black doorway of rough dark stone standing in the back wall, its opening filled with flat depthless black, worn carvings of eyes around the frame, broken pillars at the sides, a floor of cracked dark stone. Blacks, ash greys, bone — no color, no glow." },
};

const 고를 = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const 할것 = 고를.length ? 고를 : Object.keys(터들);
for (const n of 할것) if (!(n in 터들)) { console.error(`모르는 터: ${n} (있는 것: ${Object.keys(터들).join(" · ")})`); process.exit(1); }

console.log(`구간 배경 ${할것.length}장 — gpt-image-2 · 1536×1024 → 396×168`);
if (!진짜) { console.log("--진짜 를 붙이면 뽑는다"); process.exit(0); }

const OpenAI = (await import("openai")).default;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY!, maxRetries: 2 });
const 막힌것: string[] = [];

for (const 키 of 할것) {
  const t = 터들[키];
  console.log(`\n${t.이름}…`);
  let r: any;
  try {
    r = await openai.images.generate({
      model: "gpt-image-2", prompt: `${t.말} ${결}`, n: 1, size: "1536x1024", quality: "low",
    });
  } catch (e: any) {
    const 까닭 = e?.error?.message ?? e?.message ?? String(e);
    console.error(`  ⚠ 거절 — ${까닭.slice(0, 160)}`);
    막힌것.push(키); continue;
  }
  const b64 = r?.data?.[0]?.b64_json;
  if (!b64) { console.error("  안 왔다"); 막힌것.push(키); continue; }
  const 원본 = `${칸}/_원본-${키}.png`;
  writeFileSync(원본, Buffer.from(b64, "base64"));
  appendFileSync("engine/data/openai_image_ledger.jsonl",
    JSON.stringify({ what: `images.generate ash_구간배경 ${키}`, model: "gpt-image-2", n: 1, quality: "low", size: "1536x1024", usage: r.usage }) + "\n");

  /* **아래쪽만 잘라 396:168 비율을 만든다.** 1536 ÷ (396/168) = 651.
     위를 버리므로 바닥 18% 가 잘린 그림에서는 29% 가 된다 — 게임이 기대하는 값이다. */
  const m = await sharp(원본).metadata();
  const 높 = Math.round(m.width! * 168 / 396);
  await sharp(원본)
    .extract({ left: 0, top: m.height! - 높, width: m.width!, height: 높 })
    .resize(396, 168, { kernel: "nearest" })
    .png().toFile(`${칸}/${키}.png`);
  console.log(`  ${칸}/${키}.png — 아래 ${높}줄을 잘라 396×168`);
}
console.log(`\n끝. ${칸}/bg-*.png — 사장님이 보고 고른 뒤 ash_구간배경넣기.mts 로 넣는다.`);
if (막힌것.length) console.log(`⚠ 못 뽑은 것: ${막힌것.join(" · ")}`);
void 게임;
