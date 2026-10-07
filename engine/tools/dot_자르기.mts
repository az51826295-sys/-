/**
 * **한 줄로 그린 그림을 낱장으로 자른다** (228회차 10-04). 모델 0 · 값 0.
 *   npx tsx engine/tools/dot_자르기.mts [한장.png] [나올칸]
 *
 * 마젠타 바탕을 지우고, **세로로 빈 줄**을 찾아 칸을 가른다. 칸 수가 기대와 다르면 **멈춘다** —
 * 어림으로 8등분하면 캐릭터가 반씩 잘린 채로 게임에 들어간다(그리고 한참 뒤에야 안다).
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

const 한장 = process.argv[2] ?? "C:/Users/az518/Desktop/로키-도트/한장/_한장.png";
const 나올칸 = process.argv[3] ?? "C:/Users/az518/Desktop/로키-도트/한장/낱장";
mkdirSync(나올칸, { recursive: true });
// 넷째 인자로 이름 목록(쉼표)을 받는다 — 없으면 캐릭터 시트 8명
const 이름들 = process.argv[4]?.split(",") ?? ["r-guard","r-strike","r-mend","r-bind","mob1","mob2","mob3","boss1"];

const 원 = await sharp(한장).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
/**
 * **도트 칸 되돌리기** (10-07 사장님 "픽셀 화질이 구린데"). AI 도트 그림은 사실 ~108칸짜리 그림을 1024로 키운 것이라
 * 도트 한 칸이 9~10px 네모다. 그걸 52px 로 비스듬히 줄이면 칸이 어긋나 얼굴이 뭉갠다.
 * 그래서 **칸 크기와 시작점을 재고, 칸마다 가운데 색 하나만** 집어 원래 도트를 되살린다. `--격자없이` 로 끈다.
 */
function 격자(d: Buffer, w: number, h: number, 가로: boolean){
  const N = 가로 ? w : h, M = 가로 ? h : w;
  const 변 = new Float64Array(N);
  for (let p = 1; p < N; p++) for (let q = 0; q < M; q += 2) {
    const i = (가로 ? q*w + p : p*w + q) * 4, j = (가로 ? q*w + p - 1 : (p-1)*w + q) * 4;
    if (Math.abs(d[i]-d[j]) + Math.abs(d[i+1]-d[j+1]) + Math.abs(d[i+2]-d[j+2]) > 30) 변[p]++;
  }
  const 평균 = 변.reduce((a, b) => a + b, 0) / N || 1;
  const 줄: [number, number, number][] = [];
  for (let g = 5; g <= 16; g += 0.02) {
    let 최 = 0, 최위 = 0;
    for (let φ = 0; φ < g; φ += 0.25) {
      let s = 0, n = 0;
      for (let x = φ; x < N; x += g) { s += 변[Math.round(x)] ?? 0; n++; }
      if (s/n > 최) { 최 = s/n; 최위 = φ; }
    }
    줄.push([g, 최위, 최/평균]);
  }
  const 최고 = Math.max(...줄.map((x) => x[2]));
  return 줄.find((x) => x[2] >= 최고 * .92)!;          // 배수(2칸·3칸)도 맞으니 가장 작은 칸을 고른다
}
let 격자쓰기 = !process.argv.includes("--격자없이");
let data = 원.data, W = 원.info.width, H = 원.info.height;
let [gx, px, sx] = 격자(data, W, H, true), [gy, py, sy] = 격자(data, W, H, false);
// 한 축이 다른 축의 정수배로 잡히면(10-07 흑마법사 7.58×15.16) 두 칸을 한 칸으로 본 것 — 작은 쪽으로 맞춘다
{ const 작 = Math.min(gx, gy), 큰 = Math.max(gx, gy), 배 = Math.round(큰 / 작);
  if (배 >= 2 && Math.abs(큰 / 작 - 배) < .05) { if (gx > gy) { gx = gy; px = px % gx; } else { gy = gx; py = py % gy; } } }
// 칸이 또렷하지 않으면(10-07 중세 시트: 맞음 1.1배) 칸 되돌리기를 하지 않는다 — 없는 칸으로 자르면 그림이 부서진다
if (격자쓰기 && (sx < 2 || sy < 2 || Math.abs(gx - gy) > 1)) {
  console.log(`도트 칸이 또렷하지 않다(${gx.toFixed(2)}×${gy.toFixed(2)}, 맞음 ${sx.toFixed(1)}·${sy.toFixed(1)}배) — 예전 방식으로 자른다`);
  격자쓰기 = false;
}
/**
 * **칸을 한 결로 묶는다** (10-07 동물판: 같은 주문인데 셋은 5.12px, 하나는 10.22px 칸으로 왔다 — 두 배 고운 셋이 섞이면
 * 또 다른 화가가 된다). `--칸=10` 이면 그보다 고운 그림은 칸을 f×f 로 묶어 **약 10px 칸**에 맞춘다. 묶을 땐 가장 많은 색.
 */
const 목표칸 = Number(process.argv.find((a) => a.startsWith("--칸="))?.slice(4) ?? 0);
const 묶음 = 격자쓰기 && 목표칸 ? Math.max(1, Math.round(목표칸 / gx)) : 1;
if (격자쓰기) {
  const W2 = Math.floor((W - px) / (gx * 묶음)), H2 = Math.floor((H - py) / (gy * 묶음));
  const 새 = Buffer.alloc(W2 * H2 * 4);
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
    const 셈 = new Map<string, [number, number]>();
    for (let a = 0; a < 묶음; a++) for (let b = 0; b < 묶음; b++) {
      const sx0 = Math.min(W - 1, Math.round(px + ((x*묶음 + a) + .5) * gx)), sy0 = Math.min(H - 1, Math.round(py + ((y*묶음 + b) + .5) * gy));
      const i = (sy0*W + sx0)*4, k = `${data[i]>>3},${data[i+1]>>3},${data[i+2]>>3}`;
      const 앞 = 셈.get(k); 셈.set(k, [i, (앞?.[1] ?? 0) + 1]);
    }
    const [i] = [...셈.values()].sort((p, q) => q[1] - p[1])[0];
    data.copy(새, (y*W2 + x)*4, i, i + 4);
  }
  if (묶음 > 1) console.log(`  칸 ${묶음}×${묶음} 을 하나로 묶었다(목표 ${목표칸}px)`);
  console.log(`도트 칸 ${gx.toFixed(2)}×${gy.toFixed(2)}px (맞음 ${sx.toFixed(1)}·${sy.toFixed(1)}배) → ${W}×${H} 를 ${W2}×${H2} 도트로`);
  data = 새; W = W2; H = H2;
}

/** 마젠타인가. 바탕이 조금 번져 있어도 잡게 넉넉히 본다. */
const 바탕인가 = (i: number) => {
  const r = data[i], g = data[i+1], b = data[i+2];
  return r > 150 && b > 150 && g < 120 && r - g > 60 && b - g > 60;
};
for (let i = 0; i < data.length; i += 4) if (바탕인가(i)) data[i+3] = 0;

// 바탕과 외곽선이 섞인 분홍 테두리 — 투명칸에 맞닿은 것만 벗긴다(보라 옷 안쪽은 안 닿아서 안 건드린다)
const 투명칸 = (x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H || data[(y*W + x)*4 + 3] === 0;
let 벗긴것 = 0;
for (let 겹 = 0; 겹 < (격자쓰기 ? 0 : 2); 겹++) {
  const 지울: number[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y*W + x)*4;
    if (data[i+3] === 0) continue;
    if (!(투명칸(x-1,y) || 투명칸(x+1,y) || 투명칸(x,y-1) || 투명칸(x,y+1))) continue;
    const r = data[i], g = data[i+1], b = data[i+2];
    if (r > 90 && b > 90 && g < Math.min(r, b) * 0.75) 지울.push(i);
  }
  for (const i of 지울) data[i+3] = 0;
  벗긴것 += 지울.length;
}
console.log(`분홍 테두리 ${벗긴것}픽셀 벗김`);
/**
 * **어두운 자주 띠를 되돌린다** (10-07 사장님 "넌 자르기를 못해"). 위에서 밝은 분홍만 벗겨서,
 * 검은 외곽선과 마젠타가 섞인 **어두운 자주색** 테두리가 전부 남아 있었다. 지우면 외곽선이 얇아지니
 * 지우지 않고 **마젠타 성분(r·b 가 g 보다 높은 만큼)을 빼서** 원래 외곽선 색으로 돌린다. 테두리 두 겹만.
 */
let 되돌린것 = 0;
const 테두리 = new Uint8Array(W * H);
for (let 겹 = 1; 겹 <= (격자쓰기 ? 1 : 2); 겹++) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const j = y*W + x;
    if (data[j*4+3] === 0 || 테두리[j]) continue;
    const 옆 = [[x-1,y],[x+1,y],[x,y-1],[x,y+1]].some(([a,b]) => 투명칸(a,b) || (겹 === 2 && a >= 0 && b >= 0 && a < W && b < H && 테두리[b*W+a] === 1));
    if (옆) 테두리[j] = 겹;
  }
}
for (let j = 0; j < W*H; j++) {
  if (!테두리[j]) continue;
  const i = j*4, r = data[i], g = data[i+1], b = data[i+2];
  const k = Math.min(r, b) - g;
  if (k > 18 && Math.abs(r - b) < 70) { data[i] = r - k; data[i+2] = b - k; 되돌린것++; }
}
console.log(`자주 띠 ${되돌린것}픽셀 외곽선 색으로 되돌림`);

// 세로줄마다 몸이 있는지 — 없는 줄이 칸의 경계다
const 찬줄: boolean[] = [];
for (let x = 0; x < W; x++) {
  let 참 = false;
  for (let y = 0; y < H; y++) if (data[(y*W + x)*4 + 3] > 40) { 참 = true; break; }
  찬줄.push(참);
}
const 칸들: [number, number][] = [];
let 시작 = -1;
for (let x = 0; x <= W; x++) {
  if (x < W && 찬줄[x]) { if (시작 < 0) 시작 = x; }
  else if (시작 >= 0) { if (x - 시작 > 12) 칸들.push([시작, x]); 시작 = -1; }
}
/**
 * **붙은 칸을 가른다.** 칼이나 꼬리가 옆으로 뻗으면 두 사람이 한 칸으로 붙는다(10-04: 371px 한 칸).
 * 그때는 그 칸 안에서 **몸이 제일 얇은 자리**를 찾아 거기서 자른다 — 빈 줄이 없어도 허리는 있다.
 */
const 높이 = (x: number) => { let n = 0; for (let y = 0; y < H; y++) if (data[(y*W + x)*4 + 3] > 40) n++; return n; };
/**
 * **빈 줄로 찾은 칸이 너무 적으면 멈춘다** (10-07). 바닥 줄이 깔린 시트는 전체가 한 칸이 되고,
 * 아래 "가장 얇은 곳 가르기" 가 그걸 8조각으로 썰어 **엉뚱한 자리를 자른 채 성공처럼** 끝났다(슬라임 키 327).
 * 가르기는 칼끝이 옆 사람에 닿은 한두 군데용이다 — 그보다 많이 갈라야 하면 시트가 잘못된 것이다.
 */
if (이름들.length - 칸들.length > 2) {
  console.error(`빈 줄로 찾은 칸이 ${칸들.length}개뿐이다(기대 ${이름들.length}) — 바닥 줄이나 붙은 캐릭터가 있는 시트다. 다시 뽑아라.`);
  process.exit(1);
}
while (칸들.length < 이름들.length) {
  const 폭 = 칸들.map(([a,b]) => b-a);
  const i = 폭.indexOf(Math.max(...폭));
  const [a, b] = 칸들[i];
  if (b - a < 40) break;
  // 가장자리 25% 는 건드리지 않는다 — 팔다리에서 자르면 안 된다
  const 왼 = a + Math.floor((b-a)*0.25), 오 = b - Math.floor((b-a)*0.25);
  let 제일얇은 = 왼, 제일 = Infinity;
  for (let x = 왼; x < 오; x++) { const h = 높이(x); if (h < 제일) { 제일 = h; 제일얇은 = x; } }
  칸들.splice(i, 1, [a, 제일얇은], [제일얇은, b]);
  console.log(`  붙어 있던 칸 ${b-a}px 을 ${제일얇은-a}px / ${b-제일얇은}px 로 갈랐다 (가장 얇은 곳 ${제일}px)`);
}
칸들.sort((p, q) => p[0] - q[0]);

console.log(`칸 ${칸들.length}개 찾음 (기대 ${이름들.length})`);
for (const [a,b] of 칸들) process.stdout.write(`${b-a}px  `);
console.log();
if (칸들.length !== 이름들.length) {
  console.error(`\n칸 수가 안 맞는다 — 어림으로 자르지 않는다. 그림을 보고 다시 뽑거나 이름 목록을 고쳐라.`);
  process.exit(1);
}

for (const [i, [a, b]] of 칸들.entries()) {
  const 폭 = b - a;
  const 조각데이터 = Buffer.alloc(폭 * H * 4);

  // raw 데이터에서 직접 영역을 잘라낸다
  for (let y = 0; y < H; y++) {
    const 원래_시작 = (y * W + a) * 4;
    const 복사_시작 = (y * 폭) * 4;
    data.copy(조각데이터, 복사_시작, 원래_시작, 원래_시작 + 폭 * 4);
  }

  let 조각;
  try {
    조각 = await sharp(조각데이터, { raw: { width: 폭, height: H, channels: 4 } })
      .trim({ threshold: 10 }).png().toBuffer({ resolveWithObject: true });
  } catch (e) {
    console.log(`${이름들[i].padEnd(10)} 칸 ${a}~${b} (${폭}px) 을 못 잘랐다 — ${e instanceof Error ? e.message.slice(0,60) : e}`);
    continue;
  }
  const { width: w0, height: h0 } = 조각.info;
  /**
   * 격자로 되살린 도트는 **줄이지 않는다** — 한 칸 = 한 도트 그대로 정사각 칸에 발을 붙여 넣는다.
   * (격자를 끄면 예전처럼 lanczos 로 키 52 에 맞춘다 — 10-07 "퀄리티가 다 달라?")
   */
  const 칸크기 = 격자쓰기 ? Math.max(64, Math.ceil((Math.max(w0, h0) + 6) / 8) * 8) : 64;
  let 몸: Buffer, 새w = w0, 새h = h0;
  // `--색=N` (10-07 "단순함"): 색을 N 가지로 묶는다 — 도트 칸은 그대로, 색만 줄인다
  const 색수 = Number(process.argv.find((a) => a.startsWith("--색="))?.slice(4) ?? 0);
  if (격자쓰기) 몸 = 색수 ? await sharp(조각.data).png({ palette: true, colours: 색수, dither: 0 }).toBuffer() : 조각.data;
  else {
    const k = Math.min(52 / h0, 58 / w0);
    새w = Math.max(1, Math.round(w0 * k)); 새h = Math.max(1, Math.round(h0 * k));
    const 섞음 = await sharp(조각.data).resize(새w, 새h, { kernel: "lanczos3" }).ensureAlpha().raw().toBuffer();
    for (let q = 3; q < 섞음.length; q += 4) 섞음[q] = 섞음[q] >= 128 ? 255 : 0;
    몸 = await sharp(섞음, { raw: { width: 새w, height: 새h, channels: 4 } }).png({ palette: true, colours: 32, dither: 0 }).toBuffer();
  }
  const 나옴 = await sharp({ create: { width: 칸크기, height: 칸크기, channels: 4, background: { r:0,g:0,b:0,alpha:0 } } })
    .composite([{ input: 몸, left: Math.round((칸크기-새w)/2), top: 칸크기 - 새h - 2 }]).png().toBuffer();
  writeFileSync(`${나올칸}/${이름들[i]}.png`, 나옴);
  console.log(`${이름들[i].padEnd(10)} ${w0}×${h0} → ${새w}×${새h} (칸 ${칸크기})`);
}
console.log(`\n${칸들.length}장 → ${나올칸}`);
