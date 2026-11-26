// 11-27 4방향 소품 자 — 기본(정면) 그림에만 있는 색 덩어리가 옆·뒤 칸에서 몇 개 사라졌나(돈 0)
// 색을 채널마다 4단계로 묶고(64칸), 정면에서 8칸 이상 칠한 색 묶음 = "보여야 할 색". 옆·뒤에서 정면의 KEEP(25%) 밑이면 "사라짐"
// (있다/없다로만 세면 이빨이 없었다: 기사 방패 금색이 칼자루에도 있어 0/6).
// 방패의 금색·나무색처럼 소품에만 있는 색이 옆에서 둘 다 사라지면 소품이 없어진 것. 뒷모습은 가려질 수 있어 따로 센다.
//   npx tsx prop_ruler.mts <시트.png> [장수=4]   또는  --dir <앞,오른,뒤,왼 png 4개 폴더>
import sharp from "sharp";
const args = process.argv.slice(2);
async function framesOf(): Promise<{ d: Buffer; w: number; h: number }[]> {
  if (args[0] === "--dir") {
    const p = args[1];
    return Promise.all(["south", "east", "north", "west"].map(async (n) => { const r = await sharp(`${p}/${n}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { d: r.data, w: r.info.width, h: r.info.height }; }));
  }
  const n = Number(args[1] ?? 4);
  const r = await sharp(args[0]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cw = Math.floor(r.info.width / n);
  return [...Array(n).keys()].map((f) => { const o = Buffer.alloc(cw * r.info.height * 4); for (let y = 0; y < r.info.height; y++) r.data.copy(o, y * cw * 4, (y * r.info.width + f * cw) * 4, (y * r.info.width + (f + 1) * cw) * 4); return { d: o, w: cw, h: r.info.height }; });
}
const bins = (f: { d: Buffer }) => { const m = new Map<number, number>(); for (let i = 0; i < f.d.length; i += 4) if (f.d[i + 3] >= 128) { const k = ((f.d[i] >> 6) << 4) | ((f.d[i + 1] >> 6) << 2) | (f.d[i + 2] >> 6); m.set(k, (m.get(k) ?? 0) + 1); } return m; };
const fr = await framesOf();
const front = bins(fr[0]);
const KEEP = Number(process.env.KEEP ?? 0.25); // 정면 칸 수의 25% 밑이면 "사라짐" — 소품 색은 옆에서 확 준다
const want = [...front.entries()].filter(([, v]) => v >= 8).map(([k]) => k);
const name = (k: number) => `#${(((k >> 4) & 3) * 85).toString(16).padStart(2, "0")}${(((k >> 2) & 3) * 85).toString(16).padStart(2, "0")}${((k & 3) * 85).toString(16).padStart(2, "0")}`;
const out = fr.slice(1).map((f, i) => { const b = bins(f); const gone = want.filter((k) => (b.get(k) ?? 0) < front.get(k)! * KEEP); return `${["오른", "뒤", "왼"][i]} 사라진 색 ${gone.length}/${want.length}${gone.length ? " " + gone.map(name).join(",") : ""}`; });
console.log(`${args.join(" ").split("/").slice(-2).join("/")} · ${out.join(" · ")}`);
