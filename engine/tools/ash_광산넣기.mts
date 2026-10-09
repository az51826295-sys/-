/**
 * **광산 몹 셋을 게임에 넣는다** (10-10 사장님 "왼쪽 세트(후보 1)로"). 모델 0 · 값 0.
 *   npx tsx engine/tools/ash_광산넣기.mts
 *
 * ash_적넣기.mts 와 같은 일을 하되, 후보 파일 자리가 다르다(`후보-1.png` 한 장).
 * **크기는 기계가 맞춘다** — 모델에게 "사람의 60%로 그려"는 10-09 에 두 번 다 안 먹혔다.
 * 기준: 기사 몸이 123 도트. 주문에 적은 비율을 그대로 도트로 환산한다.
 */
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const 뿌리 = "C:/Users/az518/Desktop/로키-도트/캐릭터";
const 그림칸 = "public/ash/art";

/** 주문에 적은 "사람의 N%" × 기사 123도트 */
const 짝 = [
  { 이름: "코볼트 주술사",  그림: "m-kobold",   후보: 2, 목표몸: 74 },   // 60%
  { 이름: "광산 해골 인부", 그림: "m-skeleton", 후보: 1, 목표몸: 117 },  // 95%
  { 이름: "동굴 암살자",    그림: "m-rogue",    후보: 1, 목표몸: 111 },  // 90%
];

/** 투명 여백을 잘라내고 **짝수 변**의 네모 칸 가운데(발은 바닥)에 다시 놓는다 */
async function 다듬기(들어온: string, 나갈: string, 목표몸: number){
  let 잘림 = await sharp(들어온).trim({ threshold: 1 }).png().toBuffer();
  let m = await sharp(잘림).metadata();
  if (m.height! !== 목표몸) {
    const 새폭 = Math.max(1, Math.round(m.width! * 목표몸 / m.height!));
    잘림 = await sharp(잘림).resize(새폭, 목표몸, { kernel: "nearest" }).png().toBuffer();
    m = await sharp(잘림).metadata();
  }
  const 변 = Math.max(m.width!, m.height!) + ((Math.max(m.width!, m.height!) % 2) ? 1 : 0);
  await sharp({ create: { width: 변, height: 변, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: 잘림, left: Math.round((변 - m.width!) / 2), top: 변 - m.height! }])
    .png().toFile(나갈);
  return { 변, 몸: `${m.width}x${m.height}` };
}

const 이름들: string[] = [];
for (const { 이름, 그림, 후보, 목표몸 } of 짝) {
  const 들어온 = `${뿌리}/${이름}/후보-${후보}.png`;
  const 큰 = `${그림칸}/${그림}.png`;
  const 잰 = await 다듬기(들어온, 큰, 목표몸);
  // 절반 그림 — 기기픽셀이 모자란 화면용. **정수배(2×2)로만** 묶는다
  await sharp(큰).resize(잰.변 / 2, 잰.변 / 2, { kernel: "nearest" }).png().toFile(`${그림칸}/${그림}-s.png`);
  이름들.push(그림, `${그림}-s`);
  console.log(`${그림}`.padEnd(12), `칸 ${잰.변}×${잰.변}`, `몸 ${잰.몸}`);
}

const 길 = `${그림칸}/manifest.json`;
const 옛 = JSON.parse(readFileSync(길, "utf8")) as string[];
const 새 = Array.from(new Set([...옛, ...이름들])).sort();
writeFileSync(길, JSON.stringify(새));
console.log(`\nmanifest ${옛.length} → ${새.length}`);
