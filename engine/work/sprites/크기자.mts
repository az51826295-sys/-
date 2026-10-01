/**
 * **도트 조각의 크기가 일정한가** (228회차 10-01). 모델 0 · 값 0.
 *   npx tsx engine/work/sprites/크기자.mts [폴더=engine/work/sprites/png]
 *
 * 사장님 "그 도트에 크기가 일정해야 해".
 *
 * 무엇이 일정해야 하나 — 셋이다:
 *  ① **도트 한 칸의 크기**. 한 조각은 24칸으로 그리고 다른 조각은 40칸으로 그리면,
 *     같은 48×48 에 넣어도 한쪽은 네모가 굵고 한쪽은 잘다. 도트 그림에서 제일 먼저 눈에 거슬리는 자리다.
 *  ② **키**. 슬라임과 골렘이 똑같이 48 을 채우면 덩치 차이가 사라진다.
 *  ③ **바닥**. 발이 닿는 선이 제각각이면 길 위에서 둥둥 뜬다.
 *
 * 이 자는 고치지 않는다. **재서 보여 준다** — 얼마나 어긋났는지 숫자로 알아야 고칠 값을 정한다.
 * 도트 한 칸은 "같은 색이 가로로 몇 칸씩 이어지나" 로 어림한다(가장 흔한 묶음 길이의 최대공약수 쪽).
 */
import sharp from "sharp";
import { readdirSync } from "node:fs";

const 폴더 = process.argv[2] ?? "engine/work/sprites/png";
const 파일들 = readdirSync(폴더).filter((f) => f.endsWith(".png")).sort();
if (!파일들.length) { console.error(`${폴더} 에 png 가 없다`); process.exit(1); }

type 잼 = { 이름: string; 폭: number; 높이: number; 바닥: number; 칸: number; 채움: number };
const 잰것: 잼[] = [];

for (const f of 파일들) {
  const { data, info } = await sharp(`${폴더}/${f}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  const 보임 = (x: number, y: number) => data[(y * W + x) * C + 3] > 40;

  // 칠해진 테두리
  let 왼 = W, 오 = -1, 위 = H, 아래 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (보임(x, y)) {
    if (x < 왼) 왼 = x; if (x > 오) 오 = x; if (y < 위) 위 = y; if (y > 아래) 아래 = y;
  }
  if (오 < 0) { console.log(`${f}: 빈 그림`); continue; }

  // **도트 한 칸 크기 어림**: 가로로 같은 색이 이어지는 길이를 모아 가장 흔한 값을 본다.
  const 묶음: Record<number, number> = {};
  for (let y = 위; y <= 아래; y++) {
    let 길이 = 0, 앞색 = -1;
    for (let x = 왼; x <= 오 + 1; x++) {
      const 색 = x > 오 || !보임(x, y) ? -1 : (data[(y * W + x) * C] << 16) | (data[(y * W + x) * C + 1] << 8) | data[(y * W + x) * C + 2];
      if (색 === 앞색) 길이++;
      else { if (앞색 >= 0 && 길이 >= 1 && 길이 <= 8) 묶음[길이] = (묶음[길이] ?? 0) + 1; 앞색 = 색; 길이 = 1; }
    }
  }
  const 칸 = Number(Object.entries(묶음).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 1);

  let 칠한수 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (보임(x, y)) 칠한수++;

  잰것.push({
    이름: f.replace(".png", ""),
    폭: 오 - 왼 + 1, 높이: 아래 - 위 + 1,
    바닥: H - 1 - 아래,                 // 아래 여백 — 0 이면 바닥에 딱 붙었다
    칸,
    채움: Math.round((칠한수 / (W * H)) * 100),
  });
}

console.log(`${"조각".padEnd(14)} ${"폭".padStart(4)} ${"높이".padStart(5)} ${"아래여백".padStart(7)} ${"도트한칸".padStart(7)} ${"채움%".padStart(5)}`);
for (const r of 잰것) console.log(`${r.이름.padEnd(14)} ${String(r.폭).padStart(4)} ${String(r.높이).padStart(5)} ${String(r.바닥).padStart(7)} ${String(r.칸).padStart(7)} ${String(r.채움).padStart(5)}`);

/**
 * **키는 같아야 하는 게 아니라 정해진 대로 달라야 한다** — 슬라임은 작고 골렘은 커야 한다.
 * 그래서 "다 같나" 로 재면 안 된다(첫 판에 내가 그렇게 재서 멀쩡한 것을 어긋남으로 적었다).
 * 규격표(`만들기.mts` 의 `키`)와 **한 줄씩** 대 본다.
 */
const 규격: Record<string, number> = {
  enemy_weak: 13, enemy_fast: 17, enemy_tank: 22,
  tower_arrow: 19, tower_cannon: 16, tower_frost: 21,
};
const 배 = 2;   // 도트 한 칸 = 2 화면 픽셀

const 칸들 = [...new Set(잰것.map((r) => r.칸))];
const 바닥들 = [...new Set(잰것.map((r) => r.바닥))];
const 키어긋남 = 잰것.filter((r) => 규격[r.이름] !== undefined && Math.abs(r.높이 - 규격[r.이름] * 배) > 2);
const 표없음 = 잰것.filter((r) => 규격[r.이름] === undefined);
console.log("");
console.log(`${칸들.length === 1 ? "맞음  " : "어긋남"} ① 도트 한 칸이 모두 같다 — 나온 값 ${칸들.sort((a, b) => a - b).join("·")}${칸들.length === 1 && 칸들[0] === 배 ? ` (규격 ${배})` : ""}`);
if (표없음.length) console.log(`못 잼   ② 규격표에 없는 조각 ${표없음.length}개: ${표없음.map((r) => r.이름).join(", ")}`);
console.log(`${키어긋남.length === 0 ? "맞음  " : "어긋남"} ② 키가 **규격표대로**다 — ${잰것.filter((r) => 규격[r.이름] !== undefined).map((r) => `${r.이름.replace(/^(enemy|tower)_/, "")} ${r.높이}/${규격[r.이름] * 배}`).join(" · ")}`);
for (const r of 키어긋남) console.log(`        ${r.이름}: 잰 것 ${r.높이} · 규격 ${규격[r.이름] * 배}`);
console.log(`${바닥들.length === 1 && 바닥들[0] === 0 ? "맞음  " : "어긋남"} ③ 바닥이 맞는다 — 아래 여백 ${바닥들.sort((a, b) => a - b).join("·")}`);
