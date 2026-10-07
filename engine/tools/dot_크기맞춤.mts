/**
 * **몸 크기를 맞춘다** (228회차 10-04, 사장님 "몸 크기도 맞춰"). 모델 0 · 값 0.
 *   npx tsx engine/tools/dot_크기맞춤.mts <폴더> [목표키=52]
 *
 * 픽셀랩은 64×64 를 주는데 **그 안에서 차지하는 크기가 제각각**이다. 어떤 애는 칸을 꽉 채우고
 * 어떤 애는 가운데 조그맣게 있다. 그대로 나란히 세우면 키가 들쭉날쭉해서 한 게임으로 안 보인다.
 *
 * 그림을 다시 뽑을 일이 아니다 — **투명한 여백을 잘라내고 정수 배율로 키를 맞추면** 된다.
 * 정수 배율만 쓰는 까닭: 1.5배 같은 걸 쓰면 도트 격자가 깨져서 혼자 흐릿해진다.
 */
import sharp from "sharp";
import { readdirSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";

const 칸 = process.argv[2] ?? "C:/Users/az518/Desktop/로키-도트/guild";
const 목표 = Number(process.argv[3] ?? 52);
const 나올칸 = `${칸}/맞춤`;
mkdirSync(나올칸, { recursive: true });

const 들 = readdirSync(칸).filter((f) => /\.png$/i.test(f));
console.log(`${들.length}장 · 목표 키 ${목표}px (칸은 64×64 그대로)\n`);

for (const f of 들) {
  const 원본 = join(칸, f);
  // 투명 여백을 잘라 **몸만** 남긴다
  const 잘림 = await sharp(원본).trim({ threshold: 10 }).toBuffer({ resolveWithObject: true }).catch(() => null);
  if (!잘림) { copyFileSync(원본, join(나올칸, f)); console.log(`${f.padEnd(14)} 못 잘랐다 — 그대로`); continue; }
  const { width: w0, height: h0 } = 잘림.info;

  // 정수 배율만. 1배로도 너무 크면 **줄이는 쪽은 소수도 허용**한다(격자가 깨지지만 잘리는 것보단 낫다).
  let 배 = Math.max(1, Math.round(목표 / h0));
  if (h0 * 배 > 64) 배 = Math.max(1, Math.floor(64 / h0));
  let 새w = w0 * 배, 새h = h0 * 배;
  let 줄임 = "";
  if (새h > 62 || 새w > 62) { const k = Math.min(62/새h, 62/새w); 새w = Math.round(새w*k); 새h = Math.round(새h*k); 줄임 = " (칸에 맞춰 줄임)"; }

  const 몸 = await sharp(잘림.data).resize(새w, 새h, { kernel: "nearest" }).png().toBuffer();
  // 발이 같은 바닥선에 닿게 아래 정렬 — 세워 놨을 때 키만 다르고 바닥은 같아야 한다
  await sharp({ create: { width: 64, height: 64, channels: 4, background: { r:0,g:0,b:0,alpha:0 } } })
    .composite([{ input: 몸, left: Math.round((64-새w)/2), top: 64 - 새h - 2 }])
    .png().toFile(join(나올칸, f));
  console.log(`${f.padEnd(14)} 몸 ${w0}×${h0} → ${새w}×${새h} (${배}배)${줄임}`);
}
console.log(`\n→ ${나올칸}`);
