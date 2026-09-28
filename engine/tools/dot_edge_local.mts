/**
 * **바탕화면 폴더의 도트가 잘렸나** — 값 0으로 잰다 (226회차 2026-09-28).
 *
 *   npx tsx engine/tools/dot_edge_local.mts "C:/Users/az518/Desktop/도트-yuna-새판" [...]
 *
 * 09-28: 앱에 올라가 있는 도트 **96장 중 48장이 잘려 있었다**(`dot_sprite_edge_check`).
 * 고치려면 다시 자르면 되는데 — 저장소에는 **잘린 조각만** 있고 원본 시트가 없다.
 * 그런데 사장님 바탕화면에 `_sheet.png` 가 여러 판 남아 있었다. **그래서 공짜로 고칠 수 있다.**
 *
 * 다만 후보가 여럿이라 어느 판이 깨끗한지 골라야 한다. 그걸 **재서** 고른다 —
 * 자는 앱 쪽 자와 **같은 규칙**이다: 왼·오른·위 테두리에 불투명 픽셀이 있으면 잘린 것이다
 * (아래는 봐준다 — 발·몸통이 시트 바닥에 닿는 것은 정상).
 *
 * **잘린 것만 세지 않는다.** 여백이 너무 많아도 인물이 작아 보이므로 가장자리까지의 빈 칸도 같이 적는다.
 */
import sharp from "sharp";
import { readdirSync, existsSync } from "node:fs";

type 잼 = { 이름: string; 왼: number; 오른: number; 위: number; 아래: number; 여백: { 왼: number; 오른: number; 위: number } };

async function 재기(path: string): Promise<잼 | null> {
  const img = sharp(path).ensureAlpha();
  const { width: w, height: h } = await img.metadata();
  if (!w || !h) return null;
  const buf = await img.raw().toBuffer();
  const 불투명 = (x: number, y: number) => buf[(y * w + x) * 4 + 3] >= 8;
  let 왼 = 0, 오른 = 0, 위 = 0, 아래 = 0;
  for (let y = 0; y < h; y++) { if (불투명(0, y)) 왼++; if (불투명(w - 1, y)) 오른++; }
  for (let x = 0; x < w; x++) { if (불투명(x, 0)) 위++; if (불투명(x, h - 1)) 아래++; }
  const 여백 = (축: "왼" | "오른" | "위"): number => {
    const 끝 = 축 === "위" ? h : w;
    for (let d = 0; d < 끝; d++) {
      if (축 === "위") { for (let x = 0; x < w; x++) if (불투명(x, d)) return d; }
      else if (축 === "왼") { for (let y = 0; y < h; y++) if (불투명(d, y)) return d; }
      else { for (let y = 0; y < h; y++) if (불투명(w - 1 - d, y)) return d; }
    }
    return 끝;
  };
  return { 이름: path.split(/[\\/]/).pop()!, 왼, 오른, 위, 아래, 여백: { 왼: 여백("왼"), 오른: 여백("오른"), 위: 여백("위") } };
}

const 폴더들 = process.argv.slice(2);
if (!폴더들.length) { console.log("사용: dot_edge_local.mts <폴더…>"); process.exit(0); }

for (const dir of 폴더들) {
  if (!existsSync(dir)) { console.log(`\n${dir}: 없다`); continue; }
  const pngs = readdirSync(dir).filter((f) => f.endsWith(".png") && f !== "_sheet.png");
  let 잘림 = 0;
  const 줄: string[] = [];
  for (const f of pngs) {
    const r = await 재기(`${dir}/${f}`);
    if (!r) continue;
    const 나쁨 = r.왼 + r.오른 + r.위 > 0;   // 아래는 봐준다(앱 쪽 자와 같은 규칙)
    if (나쁨) 잘림++;
    줄.push(`   ${나쁨 ? "❌" : "✅"} ${r.이름.padEnd(14)} 왼 ${String(r.왼).padStart(3)} 오른 ${String(r.오른).padStart(3)} 위 ${String(r.위).padStart(3)} · 여백 왼${r.여백.왼} 오른${r.여백.오른} 위${r.여백.위}`);
  }
  console.log(`\n${dir.split(/[\\/]/).pop()} — ${pngs.length}장 중 **잘린 것 ${잘림}장**${existsSync(`${dir}/_sheet.png`) ? " · 시트 있음(공짜 재자르기 가능)" : " · 시트 없음"}`);
  for (const l of 줄) console.log(l);
}
console.log("\n규칙은 앱 쪽 자와 같다: 왼·오른·위 테두리에 불투명 픽셀이 있으면 잘린 것(아래는 봐준다).");
