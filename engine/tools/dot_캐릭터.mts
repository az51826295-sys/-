/**
 * **캐릭터 한 명을 한 장에** (10-07 사장님: "캐릭터 다시 뽑아야 해" → 카드에 맞춘 새 디자인 + 한 명씩 따로).
 *   npx tsx engine/tools/dot_캐릭터.mts <이름> [후보수=2] [--진짜]
 *
 * 여럿을 한 장에 그려 자르면 옆 사람 칼끝이 섞이고 테두리가 지저분했다(10-07 "넌 자르기를 못해").
 * 한 장에 한 명이면 자를 칸이 하나뿐이다. 그림체는 승인된 중세 시트를 **그림체 기준으로만** 보내 맞춘다.
 * 후보를 여러 장 뽑아 사장님이 고른다 — 고르는 것은 사장님 눈이다.
 */
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const 이름 = process.argv[2] ?? "세리안";
const 후보수 = Number(process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : 2);
const 진짜 = process.argv.includes("--진짜");
const 칸 = `C:/Users/az518/Desktop/로키-도트/캐릭터/${이름}`;
mkdirSync(칸, { recursive: true });
const GEMINI = JSON.parse(readFileSync(`${process.env.LOCALAPPDATA}/rookery-dot/gemini.json`, "utf8")).apiKey as string;
const 규격몸 = "C:/Users/az518/Desktop/로키-도트/캐릭터/규격/기준몸.png";   // 10-07 사장님 확정(원래 눈·원래 볼)
const 규격쓰기 = process.argv.includes("--규격") && 이름 !== "규격";
const 기준시트 = 규격쓰기 ? 규격몸 : "C:/Users/az518/Desktop/로키-도트/한장/_한장-중세.png";

/** 카드(로키-길드턴제/캐릭터/*.md)에서 그림에 필요한 것만 옮긴다. */
const 모습: Record<string, string> = {
  세리안: [
    "Serian, a LEGENDARY girl knight, the party's shield. Quiet, steady, determined expression — she says little but never steps back.",
    "Brown hair in a ponytail. Blue-steel medieval plate armor with a blue tabard; slightly more ornate than a common knight (thin gold trim on the armor edges and tabard), because she is legendary.",
    "She holds a big round kite-style shield in front of her and a long sword at her side. A faint blue magical glow along the shield rim (she casts defensive barrier magic).",
    "Subtle detail, easy to miss: a small smooth black plate is set into the center of the shield, with very faint thin blue grid lines on it.",
  ].join(" "),
  // 10-07 참고 게임 결(--어둠). 이름은 직업명(사장님). 방패 가운데 작은 판은 카드의 옛 시대 흔적 — 아주 작게.
  // 10-07 기사 확정 뒤 같은 결로. 카드의 소품만 살리고 색은 죽인다(안 화려하게).
  "검사": "A swordsman in a worn dark-red hooded cloak over chainmail and brown leather, the hood and a cloth mask hiding most of the face, holding a plain longsword with a small faded red tassel at the pommel. Lean and quick.",
  "회복술사": "A healer in a long hooded grey-white robe with a faded green sash, the deep hood hiding the face in shadow, holding a tall plain wooden staff and a small round glass vial of pale green liquid. Calm and gentle.",
  "흑마법사": "A dark mage in a tattered deep-purple hooded robe with a high collar, the face hidden in the shadow of the hood except two faint green eyes, holding an old black book bound with iron chains and a small padlock. Tall and sharp.",
  "기사": "A knight in plain dull grey iron plate armor, a closed iron great helm that fully hides the face (only a dark eye slit), a worn dark-blue cloth tabard, holding a battered iron kite shield with a small dark square plate riveted at its center, and a plain longsword. Sturdy, heavy, grounded.",
  // 10-07 사장님 "규격을 만들자" — 종이 없는 기준 몸. 모두가 이 몸을 쓴다(캐릭터/규격.md)
  "규격": "A plain base body for a cute mascot character, with NO species features: no ears, no tail, no markings. A soft round white mochi-like creature: a huge round head about 60% of the total height, a tiny round body about 60% as wide as the head, very short stubby arms and legs. Simple black dot eyes with one small white shine pixel, a tiny mouth, small pink blush on the cheeks. One arm held slightly forward as if to hold a weapon, but the hand is empty. Like a minimal kawaii sticker character.",
  // 10-07 몬스터도 한 마리씩 — 시트에서 자른 것은 도트 칸이 깨져 있었다. 크기는 사람(키 약 80도트) 기준.
  // 10-09 사장님 "적 그림체 맞춰" — 몬스터만 밝고 둥글어 혼자 튀었다. 기사 쪽 결(바랜 색·지저분한 질감)로 고쳐 적는다.
  "거대 쥐": "A giant sewer rat monster standing on its hind legs, matted dirty grey-brown fur, a long scabbed bald tail, torn ears, small dull red eyes, yellowed buck teeth. Mangy and diseased, not cute. A small monster: about 65% of a human's height.",
  "초록 슬라임": "A round slime blob monster of murky, sickly desaturated green, half translucent with grit and small bones suspended inside, a dull wet sheen rather than a bright highlight, two small simple dark eyes. A small monster: about 45% of a human's height, wider than tall.",
  "이끼 박쥐": "A bat monster with dark grey-brown fur, ragged torn leathery wings, patches of dull damp moss growing on its back and wing joints, small pale eyes and thin sharp fangs. Grim and sickly, not cute. A small monster: about 40% of a human's height, wider than tall.",
  "녹슨 철 골렘": "A bulky ancient iron golem boss, dull rust-brown and grey iron plates pitted with corrosion, dark moss in the cracks, a dim weak green glow in its deep eye sockets and one small dim core in its chest. A BOSS: about 140% of a human's height, very broad.",
};
// 10-07 외형표(지피티, 사장님 "얼굴이 다 같다")가 있으면 그게 이긴다 — 넷이 서로 겹치지 않게 짠 표다
const 표 = (() => { try { return readFileSync("C:/Users/az518/Desktop/로키-길드턴제/캐릭터/외형표.md", "utf8"); } catch { return ""; } })();
const 표줄 = 표.match(new RegExp(`^PROMPT ${이름}:\s*(.+)$`, "m"))?.[1];
if (표줄) 모습[이름] = 표줄 + (이름 === "세리안" ? " She is LEGENDARY: thin gold trim on the armor edges." : "");
/** 명단.json (10-07 규격) — 있으면 이게 이긴다. 바꿀 땐 이 한 줄만. */
const 명단 = (() => { try { return JSON.parse(readFileSync("C:/Users/az518/Desktop/로키-길드턴제/캐릭터/명단.json", "utf8")); } catch { return {}; } })();
const 줄 = 명단[이름];
if (규격쓰기 && 줄) 모습[이름] = `A cute ${줄["종"]} version of the reference body: ${줄["귀·꼬리"]}; ${줄["털색"]} fur; ${줄["무늬"]}; ${줄["포인트"]}; holding ${줄["무기"]} in the forward hand.`;
if (!모습[이름]) { console.error(`모습이 없다: ${이름} (있는 것: ${Object.keys(모습).join(", ")})`); process.exit(1); }

const 옛주문 = [
  "A single pixel art character sprite for a turn-based RPG: exactly ONE character, full body, standing, facing right, centered, the character about 80% of the image height for a human (scale monsters by the size given). Give this character a DISTINCT face, hair and colors exactly as described — do not reuse the faces from the reference.",
  모습[이름],
  "Setting: a medieval fantasy world. Nothing modern is visible except the subtle detail described.",
  // 10-07 사장님 "귀엽게 해" — 동물판 첫 장들은 몸이 길고 사실적이었다
  // 10-07 사장님 "머리 더 크게 · 갑옷은 없애고 무기만 · 몸은 더 작게"
  "PROPORTIONS: the head is HUGE — about 60% of the total height (about 1.5 heads tall); the body is very small and round.",
  "NO ARMOR AND NO CLOTHES: ignore any armor, robe, mantle, cape or outfit in the description. Draw the bare cute animal holding only its weapon or prop. Its signature color appears only as one small scarf or ribbon.",
  "MAKE IT SUPER CUTE: a kawaii chibi mascot, huge round shiny eyes, soft round cheeks, a tiny round body with short stubby arms and legs, rounded soft shapes everywhere, simplified small armor and props. Keep the described species, colors and expression, but even a stern or sly expression must look adorable.",
  // 10-07 사장님 "귀엽다는 건 단순함에서 와" — 털결·갑옷 이음매·몇 단계 그림자·30색이 귀여움을 죽였다
  "SIMPLE IS CUTE: very simple minimal pixel art like a classic cute mobile game mascot. Flat colors with at most ONE shade step, no fur texture, no armor seams or rivets, no tiny details, no gradients, at most 8 colors in total. Eyes are simple big shiny dots. Big clean shapes, thick dark outline.",
  "Draw it as a chunky pixel sprite of about 50×50 pixels upscaled — every pixel a big clear square block.",
  // 10-07 사장님 "머리털 없애" — 동물에게 사람 머리 모양(포니테일·단발·앞머리·땋은 머리)을 붙이지 않는다
  "NO HUMAN HAIR: no hairstyle, no ponytail, no bangs, no bob, no braid, no long hair, no hair buns. The head is the natural animal head only (its own fur or feathers). If a hair color was described, use it only as a small accent instead — ear tips, a scarf or a ribbon.",
  ...(규격쓰기 ? [
    "REFERENCE IMAGE = OUR BODY SPEC. Copy its body EXACTLY: the same head shape and size, the same tiny body, the same stubby limbs, the same dot eyes, blush and outline, the same pose and the same overall size in the frame. ONLY add the species features (ears, tail, face markings, fur color), one small scarf or ribbon, and the weapon in the forward hand. Do not change the proportions at all.",
  ] : []),
  ...(규격쓰기 ? [] : ["REFERENCE IMAGE: our game's approved character sheet, for ART STYLE ONLY. Match its pixel size, outline thickness, shading, palette saturation and chibi proportions (about 2.5 heads tall, big simple eyes) exactly. Do NOT draw any character from the reference."]),
  "Pure solid magenta (#FF00FF) background filling every pixel that is not the character. No ground, no shadow, no text, no frame. Square image.",
].join(" ");
/**
 * **`--어둠`** (10-07 사장님이 보여 준 참고 게임 결 — 기억 guild-turn-art-reference).
 * 안 화려하게, 사실 비율, 철·가죽·천, 얼굴은 투구·후드로 가린다. 참고 화면은 **그림체만** — 그 게임 캐릭터는 안 베낀다.
 * 그 앞의 귀여운판·동물판 주문(아래 옛주문)은 사장님이 접었다.
 */
const 어둠 = process.argv.includes("--어둠");
const 참고화면 = "C:/Users/az518/Desktop/로키-도트/참고/모험가목록-1.jpg";
/**
 * **그림 안에서 차지할 높이.** 사람은 0.8, 몬스터는 그보다 작다 — 기사(몸 123도트)에 견준 비율을 그대로 옮긴다.
 * 10-09: 이 값을 안 주고 "사람 대비 65%" 라고만 적었더니 넷 다 사람만 하게 나왔다.
 */
const 틀표: Record<string, number> = { "거대 쥐": .52, "초록 슬라임": .36, "이끼 박쥐": .32, "녹슨 철 골렘": .62 };
const 틀높이 = 틀표[이름] ?? .8;
const 어둠주문 = [
  // 10-09: "사람 대비 65%" 라고만 적었더니 **그림 안에 사람이 없어** 모델이 기준을 못 잡고 넷 다 사람만 하게 그렸다
  // (쥐 몸 115 도트 = 기사 123 의 93%). 그래서 **그림 높이의 몇 %** 라는 절대 틀로 다시 적는다.
  "A single pixel art character sprite for a dark fantasy RPG: exactly ONE character, full body, standing, facing right, horizontally centered and standing on the bottom edge area.",
  `FRAME SIZE — THIS IS A HARD RULE: the creature must fill only about ${Math.round(틀높이*100)}% of the image height. The remaining space above it must be empty magenta background. Do not zoom in, do not crop, do not fill the frame.`,
  모습[이름],
  "REFERENCE IMAGE: a screenshot of a mobile RPG roster. Use it for ART STYLE ONLY — copy the look of the small character portraits on the left: muted, desaturated, gritty dark-fantasy palette; realistic proportions (about 4.5 heads tall, NOT chibi); dense small pixel detail with dark outlines; materials read as iron, leather and cloth. Do NOT copy any character from it and do NOT draw any UI.",
  ...(이름 !== "기사" ? ["SECOND REFERENCE IMAGE: our approved knight sprite. Match it EXACTLY in pixel size, the character's size in the frame, outline darkness, shading and muted palette — this character must look like it is from the same sprite set as the knight. Do not draw the knight."] : []),
  "NOT FLASHY: no gold trim, no glowing rims, no sparkles, no bright saturated colors. Faces are mostly hidden by helmets, hoods or shadow — identity comes from silhouette, weapon and material, not from a pretty face.",
  "Pure solid magenta (#FF00FF) background filling every pixel that is not the character. No ground, no shadow, no text, no frame. Square image.",
].join(" ");
const 주문 = 어둠 ? 어둠주문 : 옛주문;


console.log(`${이름} — 후보 ${후보수}장`);
if (!진짜) { console.log("--진짜 를 붙이면 뽑는다"); process.exit(0); }

async function 한장(모델: string){
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${모델}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": GEMINI, "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [
      { inlineData: { mimeType: 어둠 ? "image/jpeg" : "image/png", data: readFileSync(어둠 ? 참고화면 : 기준시트).toString("base64") } },
      ...(어둠 && 이름 !== "기사" ? [{ inlineData: { mimeType: "image/png", data: readFileSync("C:/Users/az518/Desktop/로키-도트/캐릭터/기사/확정.png").toString("base64") } }] : []),
      { text: 주문 } ] }] }),
    signal: AbortSignal.timeout(300_000),
  });
}
for (let k = 1; k <= 후보수; k++) {
  // Pro 먼저, 몰려서(503) 안 되면 Flash — 10-07 Pro 가 1시간 반 내내 503 이었다
  let r = await 한장("gemini-3-pro-image"), 쓴 = "pro";
  if (r.status === 503 || r.status === 429) { r = await 한장("gemini-3.1-flash-image"); 쓴 = "flash"; }
  if (!r.ok) { console.log(`  후보 ${k} 거절 ${r.status}`); continue; }
  const j = await r.json() as { candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[] };
  const d = j.candidates?.[0]?.content?.parts?.find((x) => x.inlineData?.data)?.inlineData?.data;
  if (!d) { console.log(`  후보 ${k} — 그림이 안 왔다`); continue; }
  const 원본 = `${칸}/_원본-${k}.png`;
  writeFileSync(원본, Buffer.from(d, "base64"));
  // 자르기는 같은 도구(마젠타 지우기·자주 띠 되돌리기)로 — 칸은 하나
  // shell 없이 — 이름의 띄어쓰기가 인자를 쪼갰다(10-07). --칸=20·--색=8 로 억지로 줄이면 단순하게 잘 나온 원본을 망가뜨린다.
  execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "engine/tools/dot_자르기.mts", 원본, `${칸}/후보-${k}`, 이름, 어둠 ? "--칸=7.58" : "--칸=10"], { stdio: "ignore" });
  const m = await sharp(원본).metadata();
  console.log(`  후보 ${k} (${쓴}, ${m.width}×${m.height}) → ${칸}/후보-${k}/${이름}.png`);
  if (process.argv.includes("--넣기") && 줄?.["파일"] && k === 1) {
    const 게임 = "C:/Users/az518/Desktop/로키-길드턴제/art";
    copyFileSync(`${칸}/후보-${k}/${이름}.png`, `${게임}/${줄["파일"]}.png`);
    const 목록 = JSON.parse(readFileSync(`${게임}/manifest.json`, "utf8")) as string[];
    if (!목록.includes(줄["파일"])) { 목록.push(줄["파일"]); 목록.sort(); writeFileSync(`${게임}/manifest.json`, JSON.stringify(목록)); }
    console.log(`  → 게임에 넣음 art/${줄["파일"]}.png`);
  }
}
