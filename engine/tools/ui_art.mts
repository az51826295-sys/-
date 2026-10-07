/**
 * **UI 조각을 하나하나 그림으로 뽑는다** (228회차 10-04, 사장님 *"디자인 다 밋밋하다, 하나하나 그림 넣어"*).
 *   npx tsx engine/tools/ui_art.mts [묶음] [--진짜]
 *
 * 지금까지 밋밋했던 까닭은 간단하다: **배경만 그림이고 나머지는 전부 색칠한 사각형**이었다.
 * 단추도 네모, 패널도 네모, 아이콘은 글꼴 아이콘. 그러면 아무리 배경이 좋아도 웹페이지로 보인다.
 * 그래서 **틀·단추·아이콘까지 전부 그린다.**
 *
 * 투명 배경이 필요한 조각(아이콘·단추·틀)은 **순수 마젠타 바탕**에 그리게 하고 코드가 지운다.
 * 모델에게 "투명하게" 라고 하면 체크무늬를 **그려서** 준다 — 09-27 에 배경 자가 없어 안 지워진 판에 1등을 줬었다.
 */
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const 묶음 = process.argv[2] ?? "guild";
const 진짜 = process.argv.includes("--진짜");
const 칸 = `C:/Users/az518/Desktop/로키-UI/${묶음}`;
mkdirSync(칸, { recursive: true });
const GEMINI = JSON.parse(readFileSync(`${process.env.LOCALAPPDATA}/rookery-dot/gemini.json`, "utf8")).apiKey as string;

/** 모든 조각이 같은 세상에서 온 것처럼 보이게 하는 공통 줄. 이게 빠지면 조각마다 다른 게임이 된다. */
const 세상 = [
  "Art style: dark post-apocalyptic fantasy game UI, thousands of years after a nuclear war —",
  "humanity rebuilt to a medieval age on top of the ruins of the old world.",
  "Materials: pitted dark iron, scavenged steel plate, weathered bone-grey wood, dull brass rivets, cracked concrete.",
  "Desaturated palette: cold slate blue-grey, rust brown, ash. Almost no bright color. Grim, heavy, worn.",
  "Hand-painted game asset, clean readable shapes, no text, no letters, no numbers, no watermark.",
].join(" ");

type 조각 = { 이름: string; 주문: string; 투명: boolean };
const 묶음들: Record<string, 조각[]> = {
  guild: [
    { 이름: "bg-guild", 투명: false, 주문: "A vertical 9:16 background of a guild hall interior in ruins. Cold stone walls, a few guttering candles, long shadows, empty chairs, a cracked banner on the wall, dust in the air. The CENTER of the image is empty floor — a character will stand there, so keep the middle clear and uncluttered. Dark, quiet, almost abandoned." },
    { 이름: "panel", 투명: true, 주문: "A single empty rectangular UI panel frame for a game menu, seen straight on, flat front view. A border of riveted dark iron plates over a dull slate backing. The inside of the panel is a flat dark surface. Nothing inside it. Wide rectangle." },
    { 이름: "btn", 투명: true, 주문: "A single empty wide rectangular game UI button, straight on, flat front view. Scavenged steel plate with a brass rim and four corner rivets, slightly worn. Empty face, nothing written on it." },
    { 이름: "btn-press", 투명: true, 주문: "The same wide rectangular steel-plate game UI button but pressed in and darker, as if recessed. Empty face, nothing written on it." },
    { 이름: "tab-shop", 투명: true, 주문: "A single game UI icon of a merchant's hanging scale with coins, carved from dark iron. Centered, simple silhouette, readable at small size." },
    { 이름: "tab-forge", 투명: true, 주문: "A single game UI icon of a blacksmith's anvil with a hammer, dark iron. Centered, simple silhouette, readable at small size." },
    { 이름: "tab-guild", 투명: true, 주문: "A single game UI icon of a guild crest — a worn shield with a simple engraved mark, dark iron and brass. Centered, simple silhouette, readable at small size." },
    { 이름: "tab-battle", 투명: true, 주문: "A single game UI icon of a chipped sword crossed over a cracked stone stair leading down. Dark iron. Centered, simple silhouette, readable at small size." },
    { 이름: "tab-char", 투명: true, 주문: "A single game UI icon of a human bust silhouette inside a riveted iron ring, like a dog tag portrait. Centered, simple silhouette, readable at small size." },
    { 이름: "mailbox", 투명: true, 주문: "A single game UI icon of an old iron mailbox with a folded letter sticking out. Centered, simple silhouette, readable at small size." },
    { 이름: "coin", 투명: true, 주문: "A single game UI icon of one worn scavenged metal coin, scratched, dull brass. Centered, simple silhouette, readable at small size." },
    { 이름: "shard", 투명: true, 주문: "A single game UI icon of one glowing green irradiated crystal shard — the only saturated color in the whole game. Centered, simple silhouette, readable at small size." },
  ],
  /** 두 번째 안 (10-04). 첫 판은 "나쁘진 않다" 였다 — 틀이 전부 같은 패널을 늘여 쓴 게 탁해 보인 탓이 크다. */
  guild2: [
    { 이름: "bg-guild2", 투명: false, 주문: "A vertical 9:16 background: the inside of a vast ruined guild hall. A collapsed ceiling lets a single shaft of pale ash-light fall straight down into the CENTER of the room, where the floor is bare and empty — a character will stand exactly there, so keep the middle completely clear. Around the edges: toppled stone pillars, a long empty table, a notice board with torn papers, hanging chains, drifting dust. Deep perspective into darkness at the back. Cold, still, abandoned for a long time." },
    { 이름: "tabbar", 투명: true, 주문: "A single horizontal game UI bottom bar plate, very wide and short, seen straight on. Heavy riveted iron beam with scavenged steel plating and a worn brass edge along the top. Flat dark face, nothing on it. Wide thin horizontal strip." },
    { 이름: "round", 투명: true, 주문: "A single empty circular game UI button, straight on, flat front view. A ring of riveted dark iron around a flat dark slate face. Perfectly round, empty inside, nothing written on it." },
    { 이름: "nameplate", 투명: true, 주문: "A single long narrow horizontal game UI nameplate banner, straight on. A thin strip of tarnished brass with pointed ends and two small rivets, mounted on dark iron. Empty face, nothing written on it." },
    { 이름: "ico-notice", 투명: true, 주문: "A single game UI icon of a torn notice paper nailed to a plank with one nail. Centered, simple silhouette, readable at small size." },
    { 이름: "ico-gear", 투명: true, 주문: "A single game UI icon of a worn iron gear with a few broken teeth. Centered, simple silhouette, readable at small size." },
  ],
};
const 할것 = 묶음들[묶음];
if (!할것) { console.error(`묶음은 ${Object.keys(묶음들).join(" · ")} 중 하나`); process.exit(1); }
console.log(`${묶음} — ${할것.length}조각`);
if (!진짜) { console.log("--진짜 를 붙이면 뽑는다"); process.exit(0); }

/** 마젠타 바탕을 지운다. 모델은 투명을 못 내므로 **우리가 만든다.** */
async function 바탕지우기(buf: Buffer): Promise<{ png: Buffer; 지운비율: number }> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let 지움 = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > 140 && b > 140 && g < 110 && r - g > 50 && b - g > 50) { data[i + 3] = 0; 지움++; }
  }
  const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  return { png, 지운비율: 지움 / (info.width * info.height) };
}

let 쓴것 = 0;
for (const c of 할것) {
  const 나올곳 = `${칸}/${c.이름}.png`;
  if (existsSync(나올곳)) { console.log(`  ${c.이름} — 이미 있음, 건너뜀`); continue; }
  const 주문 = [세상, c.주문, c.투명
    ? "The background behind the object is PURE SOLID MAGENTA (#FF00FF), filling every pixel that is not the object itself. No checkerboard, no scenery, no shadow cast on the background."
    : "",
  ].filter(Boolean).join(" ");
  const t0 = Date.now();
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent", {
      method: "POST",
      headers: { "x-goog-api-key": GEMINI, "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: 주문 }] }] }),
      signal: AbortSignal.timeout(300_000),
    });
    if (!r.ok) { console.log(`  ${c.이름} 거절 ${r.status}: ${(await r.text()).slice(0, 120)}`); continue; }
    const j = await r.json() as { candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[] };
    const d = j.candidates?.[0]?.content?.parts?.find((x) => x.inlineData?.data)?.inlineData?.data;
    if (!d) { console.log(`  ${c.이름} — 그림이 안 왔다`); continue; }
    let buf: Buffer = Buffer.from(d, "base64");
    let 말 = "";
    if (c.투명) {
      const { png, 지운비율 } = await 바탕지우기(buf);
      buf = png;
      말 = ` · 바탕 ${(지운비율 * 100).toFixed(0)}% 지움${지운비율 < 0.05 ? "  ← 마젠타가 거의 없다, 눈으로 볼 것" : ""}`;
    }
    writeFileSync(나올곳, buf);
    쓴것++;
    console.log(`  ${c.이름} → ${(buf.length / 1024).toFixed(0)}KB · ${((Date.now() - t0) / 1000).toFixed(0)}초${말}`);
  } catch (e) { console.log(`  ${c.이름} 떨어짐: ${e instanceof Error ? e.message.slice(0, 100) : e}`); }
}
console.log(`\n${쓴것}장 → ${칸}`);
