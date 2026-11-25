// 프레임 흔들림 자: 프레임마다 발바닥 줄(맨 아래 칠한 줄)과 몸 가운데(칠한 칸 무게중심 x). 움직임 시트에서 이게 흔들리면 재생할 때 덜컹인다. 돈 0.
import { readdirSync } from "node:fs";
import sharp from "sharp";
const D = process.argv[2];
for (const f of readdirSync(D).filter((x) => /-(walk|turn)-1x\.png$/.test(x))) {
  const p = `${D}/${f}`; const m = await sharp(p).metadata(); const cw = Math.floor(m.width! / 4), H = m.height!;
  const st = await Promise.all([0, 1, 2, 3].map(async (i) => {
    const b = await sharp(p).extract({ left: i * cw, top: 0, width: cw, height: H }).ensureAlpha().raw().toBuffer();
    let bot = -1, top = -1, sx = 0, n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < cw; x++) if (b[(y * cw + x) * 4 + 3]) { if (top < 0) top = y; bot = y; sx += x; n++; }
    return { bot, top, cx: sx / Math.max(1, n) };
  }));
  const spread = (a: number[]) => Math.max(...a) - Math.min(...a);
  console.log(f.replace("-1x.png", ""), `발바닥 ${st.map((s) => s.bot).join("/")} (흔들림 ${spread(st.map((s) => s.bot))}) · 머리 ${st.map((s) => s.top).join("/")} · 가운데 x ${st.map((s) => s.cx.toFixed(1)).join("/")} (흔들림 ${spread(st.map((s) => s.cx)).toFixed(1)})`);
}
