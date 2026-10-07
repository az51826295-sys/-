/**
 * **그림들이 한 결인가** (228회차 10-04, 사장님 "일관성 유지하고"). 모델 0 · 값 0.
 *   npx tsx engine/tools/dot_결자.mts <폴더> [기준파일]
 *
 * 눈으로만 보면 놓친다 — 10-04 에 그린 UI·애니 일러·도트를 섞어 놓고도 한참 뒤에야
 * "짜깁기로 보인다" 를 알았다. 그래서 **잴 수 있는 것만** 잰다:
 *
 *   ① 색 수      — 도트는 색이 적어야 한다. 한 장만 500색이면 그 장만 결이 다르다.
 *   ② 외곽선   — 가장자리 픽셀이 얼마나 어두운가. 도트 그림체를 가르는 건 외곽선 두께와 진하기다.
 *
 * **처음엔 "색이 겹치나" 로 쟀다가 버렸다**(10-04). 초록 슬라임과 회색 생존자가 같은 색을 쓸 리 없는데
 * 겹침 0% 를 "혼자 다르다" 로 찍었다. 그건 결이 아니라 **색상표**를 잰 것이었다.
 *   ③ 덩어리 크기 — 한 픽셀이 실제로 몇 픽셀짜리 네모인가(도트 격자가 어긋나면 결이 깨진다).
 *   ④ 밝기 폭    — 어떤 장만 혼자 밝거나 어두우면 떠 보인다.
 *
 * 무엇이 "좋다" 는 못 잰다. **어느 장이 혼자 다른가**만 짚는다. 고르는 것은 사장님 눈이다.
 */
import sharp from "sharp";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const 칸 = process.argv[2] ?? "C:/Users/az518/Desktop/로키-도트/guild";
const 기준이름 = process.argv[3] ?? "r-strike.png";
const 들 = readdirSync(칸).filter((f) => /\.png$/i.test(f) && !f.startsWith("_"));
if (!들.length) { console.error("그림이 없다"); process.exit(1); }

type 잼 = { 이름: string; 색수: number; 겹침: number; 덩어리: number; 밝기: number };
async function 재기(f: string): Promise<잼 | null> {
  const { data, info } = await sharp(join(칸, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const 색 = new Map<number, number>();
  let 밝합 = 0, 셈 = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i+3] < 40) continue;                       // 투명한 자리는 안 센다
    const k = (data[i] >> 3 << 10) | (data[i+1] >> 3 << 5) | (data[i+2] >> 3);
    색.set(k, (색.get(k) ?? 0) + 1);
    밝합 += (data[i]*0.299 + data[i+1]*0.587 + data[i+2]*0.114); 셈++;
  }
  if (!셈) return null;
  // 덩어리: 가로로 같은 색이 몇 칸씩 이어지는가의 최빈값 — 도트 격자 크기다
  const 이음: number[] = [];
  for (let y = 0; y < info.height; y++) {
    let 앞 = -1, 길이 = 0;
    for (let x = 0; x < info.width; x++) {
      const i = (y*info.width + x) * 4;
      const k = data[i+3] < 40 ? -1 : (data[i] >> 3 << 10) | (data[i+1] >> 3 << 5) | (data[i+2] >> 3);
      if (k === 앞) 길이++; else { if (앞 >= 0 && 길이 > 0) 이음.push(길이); 앞 = k; 길이 = 1; }
    }
  }
  const 셈통 = new Map<number, number>();
  for (const l of 이음) 셈통.set(l, (셈통.get(l) ?? 0) + 1);
  const 덩어리 = [...셈통.entries()].sort((a,b) => b[1]-a[1])[0]?.[0] ?? 1;
  return { 이름: f, 색수: 색.size, 겹침: 0, 덩어리, 밝기: Math.round(밝합/셈), ...{} } as 잼 & { _색: Map<number,number> } as 잼;
}
/** 외곽선: **투명한 칸에 맞닿은 픽셀**이 그림 전체 평균보다 얼마나 어두운가(%). 두껍고 진할수록 높다. */
async function 외곽선(f: string){
  const { data, info } = await sharp(join(칸, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const 밝 = (i: number) => data[i]*0.299 + data[i+1]*0.587 + data[i+2]*0.114;
  let 안밝 = 0, 안셈 = 0, 테밝 = 0, 테셈 = 0;
  const 투명 = (x: number, y: number) => x < 0 || y < 0 || x >= info.width || y >= info.height
    || data[(y*info.width + x)*4 + 3] < 40;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y*info.width + x)*4;
    if (data[i+3] < 40) continue;
    const 테인가 = 투명(x-1,y) || 투명(x+1,y) || 투명(x,y-1) || 투명(x,y+1);
    if (테인가) { 테밝 += 밝(i); 테셈++; } else { 안밝 += 밝(i); 안셈++; }
  }
  if (!테셈 || !안셈) return null;
  return Math.round((1 - (테밝/테셈) / Math.max(1, 안밝/안셈)) * 100);   // 높을수록 테두리가 어둡다
}

const 기준테 = 들.includes(기준이름) ? await 외곽선(기준이름) : null;
if (기준테 === null) console.log(`(기준 ${기준이름} 이 없다)`);

const 줄: 잼[] = [];
for (const f of 들) {
  const m = await 재기(f);
  if (!m) continue;
  m.겹침 = (await 외곽선(f)) ?? 0;
  줄.push(m);
}
줄.sort((a,b) => a.이름.localeCompare(b.이름));

const 중간 = (xs: number[]) => xs.slice().sort((a,b)=>a-b)[Math.floor(xs.length/2)];
const 색중간 = 중간(줄.map((r)=>r.색수)), 밝중간 = 중간(줄.map((r)=>r.밝기)), 덩중간 = 중간(줄.map((r)=>r.덩어리)), 테중간 = 중간(줄.map((r)=>r.겹침));

console.log(`\n${줄.length}장 · 가운뎃값: 색 ${색중간} · 덩어리 ${덩중간} · 밝기 ${밝중간}\n`);
console.log("이름".padEnd(16) + "색수".padStart(6) + "외곽선".padStart(8) + "덩어리".padStart(7) + "밝기".padStart(6) + "  튀는 데");
for (const r of 줄) {
  const 튐: string[] = [];
  if (r.색수 > 색중간 * 2) 튐.push("색이 두 배 넘게 많다");
  if (r.색수 < 색중간 / 2) 튐.push("색이 절반도 안 된다");
  if (Math.abs(r.겹침 - 테중간) > 22) 튐.push(r.겹침 < 테중간 ? `외곽선이 흐리다 (${r.겹침}%, 다들 ${테중간}%)` : `외곽선이 진하다 (${r.겹침}%)`);
  if (r.덩어리 !== 덩중간) 튐.push(`덩어리 ${r.덩어리} (다들 ${덩중간})`);
  if (Math.abs(r.밝기 - 밝중간) > 45) 튐.push(r.밝기 > 밝중간 ? "혼자 밝다" : "혼자 어둡다");
  console.log(r.이름.padEnd(16) + String(r.색수).padStart(6) + String(r.겹침+"%").padStart(7)
    + String(r.덩어리).padStart(7) + String(r.밝기).padStart(6) + "  " + (튐.length ? 튐.join(" · ") : "—"));
}
const 튄것 = 줄.filter((r) => r.색수 > 색중간*2 || Math.abs(r.겹침-테중간) > 22 || Math.abs(r.밝기-밝중간) > 45);
console.log(`\n혼자 다른 것 ${튄것.length}장${튄것.length ? ": " + 튄것.map((r)=>r.이름).join(" · ") : ""}`);
console.log("(좋고 나쁨은 안 잰다 — 어느 장이 혼자 다른지만 짚는다)");
