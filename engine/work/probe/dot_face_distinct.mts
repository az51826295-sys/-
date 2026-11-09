/**
 * 42px 구별 자를 **지금 앱에 있는 일곱 명**에게 대 본다.
 *
 * 새 캐릭터 지우가 5.1% 로 막혔다(문턱 6%). 문턱을 내리기 전에 **좋은 쪽**을 같은 자로 재야 한다 —
 * 쓰고 있는 사람들이 그 밑이면 그 문턱이 틀린 것이다([[palette-overlap-is-not-style]]).
 */
import { readFileSync, existsSync } from "node:fs";
const sharp = (await import("sharp")).default;
const EMO = ["neutral", "happy", "shy", "sad", "angry", "surprised"];

async function 구별(slug: string): Promise<number | null> {
  const 얼굴: { data: Buffer; ch: number }[] = [];
  for (const e of EMO) {
    const p = `public/dot-sprites/${slug}/face/${e}.png`;
    if (!existsSync(p)) return null;
    const { data, info } = await sharp(readFileSync(p)).resize(42, 42, { kernel: "nearest" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    얼굴.push({ data: data as Buffer, ch: info.channels });
  }
  let 최소 = 1;
  for (let i = 0; i < 얼굴.length; i++) for (let j = i + 1; j < 얼굴.length; j++) {
    const A = 얼굴[i], B = 얼굴[j];
    let d = 0, n = 0;
    for (let p = 0; p < A.data.length; p += A.ch) {
      if (A.data[p + 3] < 128 && B.data[p + 3] < 128) continue;
      n++;
      if (Math.abs(A.data[p] - B.data[p]) + Math.abs(A.data[p + 1] - B.data[p + 1]) + Math.abs(A.data[p + 2] - B.data[p + 2]) > 60) d++;
    }
    최소 = Math.min(최소, n ? d / n : 0);
  }
  return 최소;
}

const 값: [string, number][] = [];
for (const slug of ["doyun", "haru", "nabi", "rin", "seoha", "yeonu", "yuna"]) {
  const v = await 구별(slug);
  if (v === null) { console.log(`${slug.padEnd(7)} 얼굴 파일이 없다`); continue; }
  값.push([slug, v]);
  console.log(`${slug.padEnd(7)} ${(v * 100).toFixed(1)}%${v < 0.06 ? "  ← 문턱(6%) 아래" : ""}`);
}
const 낮은것 = 값.filter(([, v]) => v < 0.06);
console.log(`\n쓰고 있는 ${값.length}명 중 문턱 아래 ${낮은것.length}명` +
  (낮은것.length ? ` (${낮은것.map(([s, v]) => `${s} ${(v * 100).toFixed(1)}%`).join(", ")}) — 문턱이 제품과 안 맞는다` : " — 문턱은 맞다"));
console.log(`제일 낮은 값 ${(Math.min(...값.map(([, v]) => v)) * 100).toFixed(1)}%`);
