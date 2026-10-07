/**
 * **한 장에 전부 같이 그린다** (228회차 10-04, 사장님 "그림체 맞추라고 다시 만들어").
 *   npx tsx engine/tools/dot_한장.mts [--진짜]
 *
 * ## 왜 낱장으로는 안 됐나
 * 픽셀랩으로 하나씩 뽑으면 **판마다 그리는 사람이 바뀐다.** `bitforge` 에 기준 그림을 줘도
 * 세기를 높이면 색까지 베껴 전부 카키가 되고, 낮추면 그림체가 다시 흩어진다. 10-04 에 네 번 다시 뽑았다.
 *
 * ## 한 번에 그리면 저절로 맞는다
 * 캐릭터 여덟을 **한 줄로 세운 그림 한 장**으로 그리면, 같은 붓으로 같은 때 그린 것이라 그림체가 어긋날 수가 없다.
 * 그다음 코드가 칸을 잘라 낱장으로 만든다. 자르는 것은 공짜다.
 */
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const 진짜 = process.argv.includes("--진짜");
const 칸 = "C:/Users/az518/Desktop/로키-도트/한장";
mkdirSync(칸, { recursive: true });
const GEMINI = JSON.parse(readFileSync(`${process.env.LOCALAPPDATA}/rookery-dot/gemini.json`, "utf8")).apiKey as string;

/**
 * 왼쪽부터 차례대로. 자를 때 이 차례를 그대로 쓴다.
 * 10-07 사장님: "핵전쟁 5000년 뒤라 중세 느낌" — 역할과 색은 그대로 두고 옷·무기만 중세로 바꾼다.
 */
// --판=이름 으로 고른다. 1구간몹 = 10-07 지피티 층 설계의 1구간에 새로 필요한 몹(이끼 박쥐)
const 판 = process.argv.find((a) => a.startsWith("--판="))?.slice(4) ?? (process.argv.includes("--현대") ? "현대" : "중세");
const 모델 = process.argv.includes("--flash") ? "gemini-3.1-flash-image" : "gemini-3-pro-image";
const 줄들: Record<string, string[][]> = {
  현대: [
    ["r-guard",  "a girl in blue-steel plate armor holding a big round shield"],
    ["r-strike", "a girl in a grey hooded coat holding a long steel sword"],
    ["r-mend",   "a girl in a white medic coat holding a glowing green vial"],
    ["r-bind",   "a girl in a dark purple coat holding a coil of iron chain"],
    ["mob1",     "a brown mutated rat monster standing on two legs"],
    ["mob2",     "a pale grey zombie husk in torn rags"],
    ["mob3",     "a round bright green slime blob monster with two eyes"],
    ["boss1",    "a bulky rusty orange scrap-metal brute with a glowing green core"],
  ],
  중세: [
    ["r-guard",  "a girl knight in blue-steel medieval plate armor with a blue tabard, holding a big round kite shield"],
    ["r-strike", "a girl swordswoman in a grey hooded traveler's cloak and leather armor, holding a long steel sword"],
    ["r-mend",   "a girl healer in a white cleric robe with a hood down, holding a glowing green potion flask"],
    ["r-bind",   "a girl warlock in a dark purple robe, holding a coil of glowing iron chain"],
    ["mob1",     "a giant brown sewer rat monster standing on two legs"],
    ["mob2",     "a pale grey ghoul in torn medieval peasant rags"],
    ["mob3",     "a round bright green slime blob monster with two eyes"],
    ["boss1",    "a bulky ancient iron golem covered in rust and moss, with one glowing green core in its chest"],
  ],
  "1구간몹": [
    ["mob-bat",  "a cute chubby moss bat monster: a round mossy-green body, two big simple eyes like the slime in the reference, small leathery wings spread, simple chunky shapes and few colors (no fur texture), drawn SMALL — about the same size as the rat in the reference"],
  ],
};
const 줄 = 줄들[판];

const 주문 = [
  `A single pixel art character line-up sheet showing exactly ${줄.length} characters standing side by side in one straight row, evenly spaced, all the same height, all facing right, all standing on the same ground line.`,
  "Style: 16-bit SNES JRPG pixel art, chibi proportions, big simple eyes, thick dark outline, flat shading, limited palette.",
  ...(판 !== "현대" ? [
    "Setting: a medieval fantasy world rebuilt 5000 years after a nuclear war — swords, cloaks and plate armor, with only faint green radioactive glow as a trace of the old world.",
    // 10-07 첫 중세 판: 치비가 아니었고 바닥 줄로 전부 이어져 잘리지 않았다 → 기준 그림 + 띄우기를 못 박는다
    판 === "중세"
      ? "REFERENCE IMAGE: the attached sheet is our game's approved art. Copy its art style EXACTLY — the same chibi proportions (about 2.5 heads tall), the same big eyes, the same outline thickness, the same scale. Only change the outfits and weapons to the medieval versions described below. Each girl must keep a distinct face and hairstyle like in the reference."
      // 10-07: 몹 하나 뽑는데 위 문장을 썼더니 기준 시트 8명을 그대로 다시 그렸다 — 새 몹은 "그림체만" 참고
      : `REFERENCE IMAGE: the attached sheet is our game's approved art, for ART STYLE ONLY. Match its pixel size, outline thickness, shading and chibi proportions exactly, and match the scale of its monsters. Do NOT draw any of the characters from the reference — draw ONLY the ${줄.length} new character(s) listed below.`,
    "Leave a WIDE gap of empty magenta between every character — no two characters, weapons or chains may touch or overlap. There is NO ground line, NO floor strip, NO shadow: the bottom of the image is plain magenta too.",
  ] : []),
  "Every character is drawn in the SAME style, the SAME scale and the SAME level of detail. They must look like they came from one sprite sheet of one game.",
  "The characters from left to right are:",
  ...줄.map(([, 말], i) => `${i + 1}. ${말}`),
  "Pure solid magenta (#FF00FF) background filling every pixel that is not a character. No ground shadow, no scenery, no text, no numbers, no labels, no frame, no grid lines.",
  줄.length > 2 ? "Wide horizontal image." : "Square image, the character centered.",
].join(" ");

console.log(`한 장에 ${줄.length}명 — ${줄.map(([n]) => n).join(" · ")}`);
if (!진짜) { console.log("--진짜 를 붙이면 뽑는다"); process.exit(0); }

const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${모델}:generateContent`, {
  method: "POST",
  headers: { "x-goog-api-key": GEMINI, "content-type": "application/json" },
  body: JSON.stringify({ contents: [{ parts: [
    ...(판 !== "현대" ? [{ inlineData: { mimeType: "image/png", data: readFileSync(판 === "중세" ? `${칸}/_한장.png` : `${칸}/_한장-중세.png`).toString("base64") } }] : []),
    { text: 주문 },
  ] }] }),
  signal: AbortSignal.timeout(300_000),
});
if (!r.ok) { console.error(`거절 ${r.status}: ${(await r.text()).slice(0, 200)}`); process.exit(1); }
const j = await r.json() as { candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[] };
const d = j.candidates?.[0]?.content?.parts?.find((x) => x.inlineData?.data)?.inlineData?.data;
if (!d) { console.error("그림이 안 왔다"); process.exit(1); }
const 나올 = 판 === "현대" ? `${칸}/_한장.png` : `${칸}/_한장-${판}.png`;
writeFileSync(나올, Buffer.from(d, "base64"));
const m = await sharp(나올).metadata();
console.log(`한 장 → ${나올} (${m.width}×${m.height})`);
console.log(`자르는 것은 dot_자르기.mts 가 한다 — 사람 눈으로 한 번 보고 자른다.`);
