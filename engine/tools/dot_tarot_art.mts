/**
 * # 타로 카드 22장을 **그린다**  (11-09, 사장님이 열쇠를 주셨다)
 *
 *   npx tsx engine/tools/dot_tarot_art.mts            ← 주문만 보여 준다(돈 0)
 *   npx tsx engine/tools/dot_tarot_art.mts --go       ← 그린다
 *   npx tsx engine/tools/dot_tarot_art.mts --go --only 별,달
 *
 * 11-06 에 없앴던 8×8 도트 그림으로 버티고 있었다. 사장님이 "열쇠 살아나면 그린다" 를 고르셨고
 * 오늘 열쇠가 살아났다.
 *
 * ## 결을 맞추는 것이 전부다
 *
 * 카드 22장이 제각각이면 덱이 아니라 그림 모음이 된다. 그래서 **모든 주문에 같은 문장**을 쓴다:
 * 세로 5:7 · 밤빛 바탕(#1b1630) · 금색(#ffd369) 한 가지 선 · 가운데 상징 하나 · 글자 없음.
 * 뽑은 뒤에는 **도트로 뭉갠다**(100×140, 16색) — 앱이 도트라 매끈한 그림은 그 칸만 튄다.
 *
 * 받는 곳은 `public/dot-tarot/<번호>.png` — 스프라이트·사진과 같이 **웹서버가 내보낸다**.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const sharp = (await import("sharp")).default;
const { createImageProvider } = await import("../../src/lib/providers/images");
const { DECK, CARD_EN } = await import("../../src/lib/dot/tarotCards");

const 끌 = (이름: string) => { const i = process.argv.indexOf(이름); return i > 0 ? process.argv[i + 1] : undefined; };
const 누구만 = (끌("--only") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const 갈까 = process.argv.includes("--go");
const W = 100, H = 140;                       // 1칸=1화소. 화면에서 네 배로 키워 쓴다.
const 밑 = "public/dot-tarot";
mkdirSync(밑, { recursive: true });

/** 카드마다 가운데에 놓을 **상징 하나**. 사람 얼굴은 안 그린다 — 작게 줄이면 뭉개진다. */
const 상징: Record<string, string> = {
  바보: "a small cliff edge with a single white flower and a tiny knapsack",
  마법사: "a hand holding up a wand, one candle flame above",
  여사제: "two pillars with a crescent moon between them",
  여황제: "a wheat sheaf and a heart-shaped shield",
  황제: "a stone throne with ram horns carved on it",
  교황: "a tall key crossed with another key under an arch",
  연인: "two cups facing each other with a rising sun behind",
  전차: "a chariot wheel with two reins",
  힘: "a lion head with an infinity loop above it",
  은둔자: "a lantern held in the dark, one star inside",
  "운명의 수레바퀴": "a spoked wheel with four small symbols around it",
  정의: "a balance scale and an upright sword",
  "매달린 사람": "a boot hanging upside down from a branch, rope tied",
  죽음: "a scythe and a single white rose",
  절제: "two cups pouring water between each other",
  악마: "a chain with an open shackle and two small horns",
  탑: "a tall tower struck by lightning, stones falling",
  별: "a large eight-pointed star over still water",
  달: "a crescent moon with two towers and a path below",
  태양: "a big sun with a sunflower under it",
  심판: "a trumpet with sound rings",
  세계: "a laurel wreath forming an oval ring",
};

const 공통 = [
  "16-bit pixel art tarot card illustration, chunky crisp pixels, no anti-aliasing.",
  "Vertical 5:7 card. Deep night-purple background (#1b1630). ONE gold accent color (#ffd369) plus a little muted violet.",
  "A single symbol centered, simple and readable at small size. Thin gold border frame inside the edges.",
  "NO text, NO letters, NO numbers, NO roman numerals, NO human faces, NO watermark.",
].join(" ");

const 그릴것 = DECK.map((이름, i) => ({ 번호: i, 이름, en: CARD_EN[이름], 주문: `${공통} The card is "${CARD_EN[이름]}": ${상징[이름]}.` }))
  .filter((c) => !누구만.length || 누구만.includes(c.이름));

console.log(`카드 ${그릴것.length}장 · 어림잡아 ${(그릴것.length * 0.03).toFixed(2)}달러 · ${Math.round(그릴것.length * 18 / 60)}분`);
if (!갈까) { for (const c of 그릴것) console.log(`  ${String(c.번호).padStart(2)} ${c.이름.padEnd(9)} ${상징[c.이름]}`); console.log(`\n주문만 봤다. 그리려면 --go`); process.exit(0); }

const 그림 = createImageProvider();
let 됨 = 0;
for (const c of 그릴것) {
  const t0 = Date.now();
  try {
    const made = await 그림.draw(c.주문, "medium", "1024x1536");
    const raw = Buffer.from(made.dataUrl.split(",")[1], "base64");
    const small = await sharp(raw).resize(W, H, { kernel: "nearest", fit: "cover" }).png({ palette: true, colors: 16, dither: 0 }).toBuffer();
    writeFileSync(join(밑, `${c.번호}.png`), small);
    됨++;
    console.log(`  ${String(c.번호).padStart(2)} ${c.이름.padEnd(9)} ${((Date.now() - t0) / 1000).toFixed(1)}s · ${Math.round(small.length / 1024)}KB`);
  } catch (e) {
    console.log(`  ✗ ${c.이름}: ${e instanceof Error ? e.message : e}`);
  }
}
console.log(`\n그린 카드 ${됨}/${그릴것.length} → ${밑} (배포해야 앱에서 보인다)`);
