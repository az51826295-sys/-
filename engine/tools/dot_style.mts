/**
 * **한 결로 맞춰 뽑는다** (228회차 10-04, 사장님 *"일관성 유지하고"*).
 *   npx tsx engine/tools/dot_style.mts <묶음> [--진짜]
 *
 * 글로만 결을 맞추려 하면 조각마다 다른 게임이 된다 — 10-04 에 그린 UI·애니 일러·도트 셋이 한 몸이 안 됐다.
 * 픽셀랩 `bitforge` 는 **기준 그림**을 받아 그 외곽선·색조·덩어리감을 따라 그린다.
 * 그래서 기준 한 장을 못 박고 나머지를 전부 거기에 맞춘다.
 */
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const 묶음 = process.argv[2] ?? "guild";
const 진짜 = process.argv.includes("--진짜");
const 칸 = `C:/Users/az518/Desktop/로키-도트/${묶음}`;
mkdirSync(칸, { recursive: true });
const KEY = JSON.parse(readFileSync(`${process.env.LOCALAPPDATA}/rookery-dot/pixellab.json`, "utf8")).apiKey as string;

/**
 * 결의 기준. 이 한 장이 게임 전체의 그림체를 정한다.
 * **기준은 튀지 않는 장으로** — 10-04 에 기준으로 삼은 장이 정작 혼자 외곽선이 흐려서,
 * 그걸 따라 그린 것들까지 같이 흔들렸다.
 */
// 10-04 사장님이 화면을 찍어 **"이거 기준으로 뽑아"** 라고 지목한 장. 결은 사장님 눈이 정한다.
const 기준길 = `${칸}/r-strike.png`;
if (!existsSync(기준길)) { console.error(`기준 그림이 없다: ${기준길}`); process.exit(1); }

/**
 * **그림체를 글로도 못 박는다** (10-04 사장님: *"지금 일관성이 없어"*).
 * `bitforge` 는 기준 그림의 **색과 외곽선**은 따라 하는데 **그림 언어**까지는 안 따라 한다.
 * 그래서 캐릭터는 눈 큰 치비인데 몬스터는 포켓몬 같은 게 나왔다. 그 줄을 모든 주문에 붙인다.
 */
const 그림체 = "chibi style, short squat proportions, big simple expressive eyes, thick dark outline, flat shading, same art style and same proportions as the reference image, full body";

type 조각 = { 이름: string; 말: string; 크기?: number };
const 묶음들: Record<string, 조각[]> = {
  guild: [
    { 이름:"r-guard", 말:"a girl in heavy STEEL BLUE plate armor holding a big riveted metal shield, facing right, side view" },
    { 이름:"r-mend",  말:"a girl in a clean WHITE field-medic coat with a red cross with a satchel, holding up a glowing green vial, facing right, side view" },
    { 이름:"r-bind",  말:"a girl in a DARK PURPLE long coat with a hood down, holding a coil of heavy iron chain, facing right, side view" },
    { 이름:"mob1",  말:"a small mutated rat monster with BROWN matted fur and glowing green eyes, standing on two legs, facing left, side view" },
    { 이름:"mob2",  말:"a small shambling zombie-like husk with PALE GREY skin wrapped in torn brown rags and rusted wire, facing left, side view" },
    { 이름:"mob3",  말:"a small round blob monster of bright GLOWING GREEN slime with two eyes and bits of scrap metal stuck in it, facing left, side view" },
    { 이름:"boss1", 말:"a stocky armored brute monster built of RUSTY ORANGE welded scrap metal plates with one glowing green core in its chest, facing left, side view" },
  ],
};
const 할것 = 묶음들[묶음];
if (!할것) { console.error(`묶음은 ${Object.keys(묶음들).join(" · ")}`); process.exit(1); }
console.log(`${묶음} — ${할것.length}조각 · 기준 ${기준길.split("/").pop()}`);
if (!진짜) { console.log("--진짜 를 붙이면 뽑는다"); process.exit(0); }

// 기준 그림은 **64로 맞춰** 보낸다(크기가 다르면 거절한다).
const 기준 = (await sharp(기준길).resize(64, 64, { kernel: "nearest", fit: "contain",
  background: { r:0,g:0,b:0,alpha:0 } }).png().toBuffer()).toString("base64");

let 쓴것 = 0;
for (const c of 할것) {
  const 나올곳 = `${칸}/${c.이름}.png`;
  if (나올곳 === 기준길) { console.log(`  ${c.이름} — 기준이라 건너뜀`); continue; }
  for (let 판 = 1; 판 <= 6; 판++) {
    try {
      const r = await fetch("https://api.pixellab.ai/v1/generate-image-bitforge", {
        method: "POST",
        headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ description: `${c.말}, ${그림체}`, image_size: { width: 64, height: 64 },
          no_background: true, style_image: { type: "base64", base64: 기준 }, style_strength: 15 }),
        signal: AbortSignal.timeout(600_000),
      });
      const 글 = await r.text();
      if (r.status === 429) { await new Promise((z) => setTimeout(z, 12_000)); continue; }
      if (!r.ok) { console.log(`  ${c.이름} 거절 ${r.status}: ${글.slice(0, 160)}`); break; }
      const b64 = (JSON.parse(글) as { image?: { base64?: string } }).image?.base64;
      if (!b64) { console.log(`  ${c.이름} — 안 왔다`); break; }
      writeFileSync(나올곳, Buffer.from(b64, "base64"));
      쓴것++; console.log(`  ${c.이름} → 결 맞춰 다시 그림${판 > 1 ? ` (${판}번째)` : ""}`);
      break;
    } catch (e) { console.log(`  ${c.이름} 떨어짐: ${e instanceof Error ? e.message.slice(0, 100) : e}`); break; }
  }
}
console.log(`\n${쓴것}장 → ${칸}`);
