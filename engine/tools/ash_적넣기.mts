/**
 * **뽑은 적 그림을 게임에 넣는다** (10-09). 모델 0 · 값 0.
 *   npx tsx engine/tools/ash_적넣기.mts
 *
 * 10-09 사장님 "적 그림체 맞춰" → 기사를 기준으로 다시 뽑았고, "둘 다 넣어" → 후보 두 장을
 * **같은 몬스터의 두 가지 생김새**로 넣는다(이름을 새로 짓지 않는다 — 이름 짓기는 사장님 몫).
 *
 * 하는 일: 후보 PNG 를 `public/ash/art/<그림>.png` · `<그림>2.png` 로 옮기고,
 * 기기픽셀이 모자란 화면용 절반 그림(`-s`)을 2×2 로 묶어 만들고, manifest.json 을 고친다.
 * 절반 그림은 **정수배(2×2)로만** 묶는다 — 1.5배 같은 건 도트 칸을 깬다.
 */
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const 뿌리 = "C:/Users/az518/Desktop/로키-도트/캐릭터";
const 그림칸 = "public/ash/art";
const 짝: Array<{ 이름: string; 그림: string }> = [
  { 이름: "거대 쥐", 그림: "m-rat" },
  { 이름: "초록 슬라임", 그림: "m-slime" },
  { 이름: "이끼 박쥐", 그림: "m-bat" },
  { 이름: "녹슨 철 골렘", 그림: "b-golem" },
];

/**
 * **몸 높이(도트)를 목표에 맞춘다.** 기사 몸이 123 도트이고 전투에선 아군·적 모두 도트 한 칸을
 * 기기픽셀 2개로 그리므로, 화면 비율은 곧 도트 비율이다. 모델이 틀 지시를 덜 지켜 크게 그려 오면
 * 여기서 줄인다 — 줄이는 배율이 정수가 아니면 칸이 조금 어긋나지만, 배경(3.04배)과 달리
 * 작은 그림을 1.3배쯤 줄이는 것이라 눈에 띄지 않는다. 보스는 크게 나온 것이 맞아 손대지 않는다.
 */
const 목표몸: Record<string, number> = { "m-rat": 77, "m-slime": 59, "m-bat": 54 };

/** 투명 여백을 잘라내고 **짝수 변**의 네모 칸 가운데에 다시 놓는다(2×2 로 묶으려면 변이 짝수여야 한다). */
async function 다듬기(들어온: string, 나갈: string, 바탕: string){
  let 잘림 = await sharp(들어온).trim({ threshold: 1 }).png().toBuffer();
  let m = await sharp(잘림).metadata();
  const 목표 = 목표몸[바탕.replace(/2$/, "")];
  if (목표 && m.height! > 목표) {
    const 새폭 = Math.max(1, Math.round(m.width! * 목표 / m.height!));
    잘림 = await sharp(잘림).resize(새폭, 목표, { kernel: "nearest" }).png().toBuffer();
    m = await sharp(잘림).metadata();
  }
  const 변 = Math.max(m.width!, m.height!) + ((Math.max(m.width!, m.height!) % 2) ? 1 : 0);
  await sharp({ create: { width: 변, height: 변, channels: 4, background: { r:0,g:0,b:0,alpha:0 } } })
    .composite([{ input: 잘림, left: Math.round((변 - m.width!)/2), top: 변 - m.height! }])   // 발을 바닥에
    .png().toFile(나갈);
  return { 변, 몸: `${m.width}x${m.height}` };
}

const 이름들: string[] = [];
for (const { 이름, 그림 } of 짝) {
  for (const k of [1, 2]) {
    const 들어온 = `${뿌리}/${이름}/후보-${k}/${이름}.png`;
    const 바탕 = k === 1 ? 그림 : `${그림}2`;
    const 큰 = `${그림칸}/${바탕}.png`;
    let 잰보: { 변: number; 몸: string } | null = null;
    try { 잰보 = await 다듬기(들어온, 큰, 바탕); } catch { console.log("건너뜀(없음):", 들어온); continue; }
    // 절반 그림 — 도트 칸을 2×2 로 묶는다(DPR 1 화면의 되돌아갈 자리)
    const 변 = 잰보!.변;
    await sharp(큰).resize(변/2, 변/2, { kernel: "nearest" }).png().toFile(`${그림칸}/${바탕}-s.png`);
    이름들.push(바탕, `${바탕}-s`);
    console.log(`${바탕}`.padEnd(12), `칸 ${변}×${변}`, `몸 ${잰보!.몸}`);
  }
}

const 길 = `${그림칸}/manifest.json`;
const 옛 = JSON.parse(readFileSync(길, "utf8")) as string[];
const 새 = Array.from(new Set([...옛, ...이름들])).sort();
writeFileSync(길, JSON.stringify(새));
console.log(`\nmanifest ${옛.length} → ${새.length}`);
