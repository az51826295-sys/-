// 홍보 그림(글자 없음): 오늘 우리 길로 만든 5캐릭터 × 4방향. 1200×630(링크 카드 크기)과 정사각 1080 두 장. 돈 0.
import sharp from "sharp";
const R = "C:/Users/az518/Desktop/두근도트-스레드/realdot";
const sheets = [`${R}/first-create/turn3b-sheet-1x.png`, ...["knight", "cat", "slime", "wizard"].map((n) => `${R}/compare4/${n}/ours-turn-1x.png`)];
async function cells(p: string) {
  const s = await sharp(p).toBuffer(); const m = await sharp(s).metadata(); const cw = m.width! / 4;
  return Promise.all([0, 1, 2, 3].map(async (i) => {
    const c = await sharp(s).extract({ left: Math.floor(i * cw), top: 0, width: Math.floor(cw), height: m.height! }).png().toBuffer();
    try { return await sharp(c).trim().png().toBuffer(); } catch { return c; }
  }));
}
const all = await Promise.all(sheets.map(cells));
async function board(W: number, H: number, cols: number, rows: number, file: string, pick: number[][]) {
  const cw = Math.floor(W / cols), ch = Math.floor(H / rows);
  const comp: sharp.OverlayOptions[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const [si, di] = pick[r * cols + c] ?? [-1, -1]; if (si < 0) continue;
    const b = all[si][di]; const m = await sharp(b).metadata();
    const sc = Math.max(1, Math.floor(Math.min((cw * 0.86) / m.width!, (ch * 0.86) / m.height!)));
    const big = await sharp(b).resize(m.width! * sc, m.height! * sc, { kernel: "nearest" }).png().toBuffer();
    comp.push({ input: big, left: c * cw + Math.floor((cw - m.width! * sc) / 2), top: r * ch + Math.floor((ch - m.height! * sc) / 2) });
  }
  await sharp({ create: { width: W, height: H, channels: 4, background: "#f4f1ea" } }).composite(comp).png().toFile(file);
}
// 링크 카드: 위 줄 = 용 4방향, 아래 줄 = 기사·고양이·슬라임·마법사 정면
await board(1200, 630, 4, 2, `${R}/promo-card.png`, [[0, 0], [0, 1], [0, 2], [0, 3], [1, 0], [2, 0], [3, 0], [4, 0]]);
// 정사각: 4×4 = 기사·고양이·슬라임·마법사 각 4방향
await board(1080, 1080, 4, 4, `${R}/promo-square.png`, [1, 2, 3, 4].flatMap((s) => [0, 1, 2, 3].map((d) => [s, d])));
console.log("ok");
