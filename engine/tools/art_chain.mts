/**
 * **도트로 디자인을 잡고, 그 도트를 보여 주며 일러스트를 그린다** (228회차 10-04).
 *   npx tsx engine/tools/art_chain.mts <역할> [--도트만|--일러만] [--진짜]
 *
 * 10-04 에 둘을 **따로** 뽑아 봤더니 캐릭터 창의 기사와 전투의 기사가 **다른 사람**이었다.
 * 게다가 디자인은 픽셀랩 쪽이 나았다 — 64×64 에 은발·갑옷 반사·칼 각도까지 들어와 있었는데,
 * 제미나이 쪽은 투구를 씌워 얼굴을 가렸다.
 *
 * 그래서 순서를 뒤집는다: **픽셀랩이 디자인을 정하고**, 그 그림을 제미나이에 **보여 주며** 크게 그리게 한다.
 * 말로 "은발에 파란 천" 이라고 옮겨 적으면 또 다른 사람이 나온다 — 그림을 그대로 넘겨야 같은 사람이 된다.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const 역할 = process.argv[2] ?? "knight";
const 도트만 = process.argv.includes("--도트만");
const 일러만 = process.argv.includes("--일러만");
const 진짜 = process.argv.includes("--진짜");
const 칸 = "C:/Users/az518/Desktop/로키-그림시험";
mkdirSync(칸, { recursive: true });

const 열쇠칸 = `${process.env.LOCALAPPDATA}/rookery-dot`;
const 읽기 = (f: string) => (existsSync(`${열쇠칸}/${f}`) ? JSON.parse(readFileSync(`${열쇠칸}/${f}`, "utf8")) : null);
const GEMINI = 읽기("gemini.json")?.apiKey ?? "";
const PIXELLAB = 읽기("pixellab.json")?.apiKey ?? "";

/** 다섯 역할. 생김새는 **도트가 정한다** — 여기엔 뼈대만 적는다. */
const 역할들: Record<string, { 한글: string; 도트: string }> = {
  knight:  { 한글: "기사",   도트: "anime style knight girl in silver white plate armor with blue cloth, no helmet, long hair, holding a longsword and a kite shield" },
  archer:  { 한글: "궁수",   도트: "anime style archer girl in light green leather armor with a hood, holding a longbow, quiver on the back" },
  healer:  { 한글: "치유사",도트: "anime style healer girl in white and gold robes, holding a glowing staff, long braided hair" },
  mage:    { 한글: "마도사",도트: "anime style mage girl in a dark purple robe and pointed hat, holding a spellbook, floating magic sparks" },
  control: { 한글: "제어관",도트: "anime style summoner girl in a black and teal coat, holding glowing chains, short hair" },
};
const r = 역할들[역할];
if (!r) { console.error(`역할은 ${Object.keys(역할들).join(" · ")} 중 하나`); process.exit(1); }

const 도트길 = `${칸}/도트-${r.한글}.png`;
const 일러길 = `${칸}/일러-${r.한글}.jpeg`;

if (!진짜) { console.log(`${r.한글} — --진짜 를 붙이면 뽑는다`); process.exit(0); }

// ── ① 픽셀랩이 디자인을 정한다 ────────────────────────────────
if (!일러만) {
  const t0 = Date.now();
  const q = await fetch("https://api.pixellab.ai/v1/generate-image-pixflux", {
    method: "POST",
    headers: { authorization: `Bearer ${PIXELLAB}`, "content-type": "application/json" },
    body: JSON.stringify({
      description: `${r.도트}, facing right, side view for a side-scrolling battle`,
      image_size: { width: 64, height: 64 }, no_background: true,
    }),
    signal: AbortSignal.timeout(300_000),
  });
  const 글 = await q.text();
  if (!q.ok) { console.error(`도트 거절 ${q.status}: ${글.slice(0, 200)}`); process.exit(1); }
  const b64 = (JSON.parse(글) as { image?: { base64?: string } }).image?.base64;
  if (!b64) { console.error(`도트가 안 왔다: ${글.slice(0, 160)}`); process.exit(1); }
  writeFileSync(도트길, Buffer.from(b64, "base64"));
  console.log(`도트 → ${도트길} (${((Date.now() - t0) / 1000).toFixed(0)}초)`);
}
if (도트만) process.exit(0);
if (!existsSync(도트길)) { console.error(`도트가 없다: ${도트길}`); process.exit(1); }

// ── ② 그 도트를 **보여 주며** 크게 그리게 한다 ──────────────────
const 주문 = [
  "The attached image is a 64x64 pixel art sprite of a game character.",
  "Redraw THAT EXACT SAME CHARACTER as a large, high-quality anime illustration for a mobile game character card.",
  "**Keep the design identical**: same hair color and length, same armor and clothing colors and shapes, same weapon, same silhouette. Do not add a helmet. Do not change the color scheme.",
  "Clean cel shading, crisp lineart, vivid colors, large expressive anime eyes, confident standing pose, facing the viewer.",
  "Full body inside the frame with small margins — head near the top, feet near the bottom, nothing cropped.",
  "The background behind the character is PURE SOLID MAGENTA (#FF00FF), filling every pixel that is not the character. No scenery, no shadow on the background, no text, no logo, no frame, no border, no watermark.",
  "Vertical composition.",
].join(" ");

const t1 = Date.now();
const g = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent", {
  method: "POST",
  headers: { "x-goog-api-key": GEMINI, "content-type": "application/json" },
  body: JSON.stringify({
    contents: [{ parts: [
      { inlineData: { mimeType: "image/png", data: readFileSync(도트길).toString("base64") } },
      { text: 주문 },
    ] }],
  }),
  signal: AbortSignal.timeout(300_000),
});
if (!g.ok) { console.error(`일러 거절 ${g.status}: ${(await g.text()).slice(0, 200)}`); process.exit(1); }
const j = await g.json() as { candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[] };
const p = j.candidates?.[0]?.content?.parts?.find((x) => x.inlineData?.data);
if (!p) { console.error("일러가 안 왔다"); process.exit(1); }
// 바탕은 **우리가 지운다.** 모델에게 "투명하게" 라고 하면 체크무늬를 그려서 준다.
const sharp = (await import("sharp")).default;
const { data, info } = await sharp(Buffer.from(p.inlineData!.data!, "base64")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let 지움 = 0;
for (let i = 0; i < data.length; i += 4) {
  const R = data[i], G = data[i + 1], B = data[i + 2];
  if (R > 140 && B > 140 && G < 110 && R - G > 50 && B - G > 50) { data[i + 3] = 0; 지움++; }
}
const 투명길 = 일러길.replace(/\.jpe?g$/i, ".png");
await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(투명길);
const 비율 = 지움 / (info.width * info.height);
console.log(`일러 → ${투명길} (${((Date.now() - t1) / 1000).toFixed(0)}초 · 바탕 ${(비율 * 100).toFixed(0)}% 지움${비율 < 0.1 ? "  ← 마젠타가 적다, 눈으로 볼 것" : ""})`);
