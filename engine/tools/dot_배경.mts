/**
 * **길드 배경 한 장** (10-07 사장님: 폐허 위 야영지). 제미나이 한 번.
 *   npx tsx engine/tools/dot_배경.mts [--진짜]
 *
 * 캐릭터 시트와 **같은 그림체 주문**을 쓰고, 캐릭터를 자를 때와 같은 비율(약 1/4)로 줄여
 * 도트 한 칸 크기를 맞춘다 — 배경만 고운 그림이면 캐릭터가 붙여 넣은 스티커로 보인다.
 */
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
const 존재 = (p: string) => existsSync(p);

const 진짜 = process.argv.includes("--진짜");
const 칸 = "C:/Users/az518/Desktop/로키-도트/배경";
mkdirSync(칸, { recursive: true });
const GEMINI = JSON.parse(readFileSync(`${process.env.LOCALAPPDATA}/rookery-dot/gemini.json`, "utf8")).apiKey as string;

const 그림체 = "Style: 16-bit SNES JRPG pixel art, thick dark outlines, flat shading, limited palette.";
const 장면들: Record<string, { 이름: string; 비율: string; 주문: string[] }> = {
  camp: { 이름: "폐허 위 야영지", 비율: "9:16", 주문: [
    "A single vertical pixel art background scene for a mobile game home screen.",
    "Scene: a small survivors' campsite on top of the rubble of a city destroyed by nuclear war, at dusk.",
    "A patched canvas tent, a warm campfire, crates and a scrap-metal workbench, a hanging lantern on a pole.",
    "Far in the background: a ruined city skyline and one tall concrete tower (an old nuclear shelter) with a faint green glow.",
    "Sky: deep dusky purple and orange, a few stars, drifting faint green radioactive dust.",
    그림체 + " Cozy but desolate mood.",
    "IMPORTANT: leave the lower middle of the image as open flat ground with nothing on it — a character will stand there.",
  ] },
  // 10-07: 전투칸은 가로로 길다(약 2.3:1). 탑 = 옛 핵 보호시설의 안.
  tower: { 이름: "탑 안 복도(전투)", 비율: "21:9", 주문: [
    "A single wide side-view pixel art battle background for a turn-based RPG.",
    "Scene: inside an abandoned nuclear shelter tower — a long concrete corridor seen from the side, heavy steel blast doors,",
    "rusty pipes and cables along the walls, yellow-black hazard stripes, a flickering ceiling light, faint green radioactive glow leaking from cracks.",
    "Dark dusky purple-grey palette with small warm orange and toxic green accents, matching a ruined post-apocalyptic world.",
    그림체 + " Moody but readable, not too busy.",
    "IMPORTANT: the bottom quarter is a flat, plain, dark floor running across the whole width — characters will stand on it on the left and right.",
  ] },
  // 10-09 사장님 "탑에 약간 맵같이 만들어 스크롤로 큰탑 사진 뽑아서" — 맵은 세로로 길게 이어 붙인다.
  // 그래서 **위아래가 맞물리는 기둥 한 토막**과 **꼭대기 한 장**으로 가른다(한 장을 늘리면 도트가 깨진다).
  탑기둥: { 이름: "탑 기둥(맵·이어붙임)", 비율: "9:16", 주문: [] },
  탑꼭대기: { 이름: "탑 꼭대기(맵)", 비율: "9:16", 주문: [] },
};
const 고른 = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "camp";
const 장 = 장면들[고른];
if (!장) { console.error(`장면은 ${Object.keys(장면들).join(" · ")}`); process.exit(1); }
/**
 * `--중세` (10-07 사장님: 핵전쟁 5000년 뒤 = 중세 느낌). **지금 배경을 기준 그림으로 보내 구도를 지킨다** —
 * 게임 코드가 모닥불·발 자리를 배경 도트 좌표로 박아 두었으니, 구도가 바뀌면 캐릭터가 허공에 선다.
 */
const 중세 = process.argv.includes("--중세");
// 10-07: Pro 가 1시간 반 내내 503 → 사장님 "일관성만 유지하면 상관없어". Flash 는 그림체 기준(캐릭터 시트)을 같이 받는다.
const 플래시 = process.argv.includes("--flash");
const 모델 = 플래시 ? "gemini-3.1-flash-image" : "gemini-3-pro-image";
const 캐릭터시트 = "C:/Users/az518/Desktop/로키-도트/한장/_한장-중세.png";
/**
 * 10-07 사장님 2차: **"중세 뿜뿜"**, 그리고 핵전쟁은 **티 내면 안 된다** — 컴퓨터·책·현대 건물 잔해로만 암시.
 * 1차 중세판은 초록 방사능 연기·빛나는 탑·경고 줄무늬·빌딩 스카이라인이 남아 너무 티가 났다.
 * 그래서 중세판은 장면 글을 **통째로 갈아 끼운다**(옛 글에 덧붙이면 옛 글의 빌딩·초록빛이 이긴다).
 */
const 중세장면: Record<string, string[]> = {
  camp: [
    "A single vertical pixel art background scene for a mobile game home screen.",
    "Scene: a knights' campsite in a high medieval fantasy world at dusk. A patched canvas tent with a small heraldic pennant, a campfire in an iron brazier,",
    "wooden crates and barrels, a wooden weapon rack with swords and spears, a hanging oil lantern on a wooden post.",
    "Background: rolling hills, a forest, and a stone castle with banners on a hill. Warm dusk sky of purple and orange with a few stars.",
    "Subtle hints only, easy to miss: one ivy-covered block of smooth grey concrete used as a wall in the ruins, a small stack of very old books by the crate,",
    "and an old boxy computer monitor half-buried in the grass used as a stool. Nothing glows green, no skyscrapers, no warning signs, no pipes.",
    그림체 + " Cozy, heroic, unmistakably medieval.",
    "IMPORTANT: leave the lower middle of the image as open flat ground with nothing on it — a character will stand there.",
  ],
  탑기둥: [
    "A single vertical pixel art image: one section of the OUTSIDE of a huge stone tower, seen straight on from a distance.",
    "The tower shaft fills the middle of the image from top to bottom: rough dark grey stone blocks, narrow arched windows with faint warm light,",
    "iron braziers on brackets, a few tattered banners, cracks with creeping ivy. Night sky with drifting mist on both sides of the tower.",
    "SEAMLESS: the very top edge and the very bottom edge must match exactly, so copies of this image can be stacked vertically with no visible seam.",
    "The tower must have the same width at the top edge and at the bottom edge, centered, with no roof, no base, no ground.",
    "Subtle hint only, easy to miss: one window frame is smooth grey concrete instead of stone.",
    "Nothing glows green, no pipes, no hazard stripes, no electric lights.",
    그림체 + " Dark, cold, towering.",
  ],
  탑꼭대기: [
    "A single vertical pixel art image: the TOP of a huge stone tower against a night sky, seen straight on from a distance.",
    "The tower shaft rises from the bottom edge and ends in a battlemented summit with a broken spire, a large iron beacon with a weak flame, and torn banners.",
    "Rough dark grey stone, narrow arched windows with faint warm light, drifting mist, a cold moon and stars behind it.",
    "The tower shaft at the BOTTOM edge must be centered and the same width as the rest of the tower, with no ground.",
    "Nothing glows green, no pipes, no hazard stripes, no electric lights.",
    그림체 + " Dark, cold, the end of a long climb.",
  ],
  tower: [
    "A single wide side-view pixel art battle background for a turn-based RPG.",
    "Scene: a corridor deep inside an old castle keep — rough stone walls, heavy wooden doors with iron bands, wooden beams, hanging heraldic banners, iron wall torches with warm firelight.",
    "Subtle hints only, easy to miss: part of the wall is very old smooth concrete patched with stone, and a rusted metal cabinet is used as a bookshelf full of dusty old books.",
    "Nothing glows green, no pipes, no hazard stripes, no electric lights.",
    그림체 + " Moody but readable, not too busy, unmistakably medieval.",
    "IMPORTANT: the bottom quarter is a flat, plain, dark stone floor running across the whole width — characters will stand on it on the left and right.",
  ],
};
const 시대 = 중세 && 존재(`${칸}/_원본-${고른}.png`) ? [
  "REFERENCE IMAGE: keep the same composition and camera angle as the attached image — the same horizon height, the fire in the same spot, the same open empty ground where a character stands, the same floor height.",
  "But redraw everything in it as described here; do NOT copy its buildings, pipes, glow or colors.",
  "SECOND REFERENCE IMAGE: our game's character sheet. Match its pixel art style exactly — the same outline thickness, the same pixel size, the same shading and saturation — so the characters look like they belong in this background.",
] : [];
const 주문 = [...(중세 ? 중세장면[고른] : 장.주문), ...시대, "No characters, no people, no animals, no text, no UI, no frame."].join(" ");

console.log(`배경 1장 — ${장.이름}`);
if (!진짜) { console.log("--진짜 를 붙이면 뽑는다"); process.exit(0); }

// 503(몰림)·429(한도)는 잠깐 뒤 다시 — 그림이 나쁜 게 아니라 줄이 긴 것이다(10-07 503 연달아)
let r!: Response;
for (let 번 = 1; 번 <= 5; 번++) {
  r = await 부르기();
  if (r.status !== 503 && r.status !== 429) break;
  console.log(`  ${r.status} — ${번 * 20}초 뒤 다시 (${번}/5)`);
  await new Promise((z) => setTimeout(z, 번 * 20_000));
}
function 부르기(){ return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${모델}:generateContent`, {
  method: "POST",
  headers: { "x-goog-api-key": GEMINI, "content-type": "application/json" },
  body: JSON.stringify({ contents: [{ parts: [
      // 탑 맵은 **이전 판이 없다** — 기준 그림을 못 읽으면 그림체 기준(캐릭터 시트)만 보낸다
      ...(중세 ? [...(존재(`${칸}/_원본-${고른}.png`) ? [{ inlineData: { mimeType: "image/png", data: readFileSync(`${칸}/_원본-${고른}.png`).toString("base64") } }] : []),
               { inlineData: { mimeType: "image/png", data: readFileSync(캐릭터시트).toString("base64") } }] : []),
      { text: 주문 } ] }],
    generationConfig: { imageConfig: { aspectRatio: 장.비율 } } }),
  signal: AbortSignal.timeout(300_000),
}); }
if (!r.ok) { console.error(`거절 ${r.status}: ${(await r.text()).slice(0, 200)}`); process.exit(1); }
const j = await r.json() as { candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[] };
const d = j.candidates?.[0]?.content?.parts?.find((x) => x.inlineData?.data)?.inlineData?.data;
if (!d) { console.error("그림이 안 왔다"); process.exit(1); }
const 이름 = 중세 ? `${고른}-중세` : 고른;
const 원본 = `${칸}/_원본-${이름}.png`;
writeFileSync(원본, Buffer.from(d, "base64"));
const m = await sharp(원본).metadata();
// 캐릭터는 약 200px → 52px(≈1/4)로 줄었다. 배경도 같은 비율로 — 도트 한 칸 크기가 같아야 한 그림이다.
const w = Math.round((m.width ?? 768) / 4), h = Math.round((m.height ?? 1376) / 4);
await sharp(원본).resize(w, h, { kernel: "nearest" }).png().toFile(`${칸}/${이름}.png`);
console.log(`원본 ${m.width}×${m.height} → ${이름}.png ${w}×${h}`);
