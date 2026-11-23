/**
 * 두근도트 그림체 18장 — CLIP 먼저 + 올리기 (11-23, 유료 호출 0). 설계: engine/docs/style-judge-bench-design.md "3판".
 *   npx tsx engine/tools/style_judge_free.mts
 */
import sharp from "sharp";
import { readFileSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const T = await import(pathToFileURL(resolve("engine/work/clip-env/node_modules/@huggingface/transformers/dist/transformers.node.mjs")).href);
T.env.cacheDir = resolve("engine/work/clip-env/models");
const MODEL = "Xenova/clip-vit-base-patch32";
const processor = await T.AutoProcessor.from_pretrained(MODEL);
const vision = await T.CLIPVisionModelWithProjection.from_pretrained(MODEL, { dtype: "q8" });

async function embed(p: string) {
  const png = await sharp(p).flatten({ background: "#ffffff" }).png().toBuffer();
  const img = await T.RawImage.fromBlob(new Blob([png]));
  const { image_embeds } = await vision(await processor(img));
  const v = Float32Array.from(image_embeds.data as Float32Array);
  const n = Math.hypot(...v); for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}
const cos = (a: Float32Array, b: Float32Array) => a.reduce((s, x, i) => s + x * b[i], 0);

type R = { 이름: string; path: string; 정답: boolean; p: number };
const J = JSON.parse(readFileSync("engine/work/style-bench/judge.json", "utf-8")) as Record<string, R[]>;
const luna = J["gpt-5.6-luna"], big = J["gpt-5"];
const pOf = (rs: R[], n: string) => { const p = rs.find((r) => r.이름 === n)!.p; return p > 1 ? p / 100 : p; };
const charOf = (n: string) => n.split("-")[1];

// 갤러리: 운영 스프라이트(캐릭터별 표정 png)
const S = "public/dot-sprites";
const gallery: { ch: string; v: Float32Array }[] = [];
for (const ch of readdirSync(S)) {
  let files: string[] = [];
  try { files = readdirSync(`${S}/${ch}`).filter((f) => f.endsWith(".png")); } catch { continue; }
  for (const f of files) gallery.push({ ch, v: await embed(`${S}/${ch}/${f}`) });
}
const items = await Promise.all(luna.map(async (r) => ({ 이름: r.이름, 정답: r.정답, ch: charOf(r.이름), v: await embed(r.path) })));
const sOf = (it: (typeof items)[number]) => Math.max(...gallery.filter((g) => g.ch !== it.ch).map((g) => cos(it.v, g.v)));
const sc = items.map((it) => ({ ...it, s: sOf(it) }));
console.log(`갤러리 ${gallery.length}장 · 후보 ${sc.length}장 (유료 호출 0)`);
for (const x of [...sc].sort((a, b) => b.s - a.s)) console.log(`  ${x.s.toFixed(3)} ${x.정답 ? "같음" : "다름"} ${x.이름}`);

const LUNA = 0.0005, BIG = 0.0103;
const judge = (name: string, f: (x: (typeof sc)[number]) => { same: boolean; usd: number; by: string }) => {
  const rs = sc.map((x) => ({ x, ...f(x) }));
  const hit = rs.filter((r) => r.same === r.x.정답).length;
  const fp = rs.filter((r) => r.same && !r.x.정답).length;
  const usd = rs.reduce((s, r) => s + r.usd, 0);
  const m = rs.filter((r) => r.by === "기계").length;
  console.log(`  ${name.padEnd(18)} ${hit}/18 · 다름→같음 ${fp} · $${usd.toFixed(4)}${m ? ` · 기계가 끝냄 ${m}` : ""}`);
  return { hit, fp, usd };
};
const cOf = (tau: number) => (x: (typeof sc)[number]) => {
  const p = pOf(luna, x.이름);
  if (Math.max(p, 1 - p) >= tau) return { same: p >= 0.5, usd: LUNA, by: "luna" };
  return { same: pOf(big, x.이름) >= 0.5, usd: LUNA + BIG, by: "gpt-5" };
};
// 한 캐릭터씩 빼고 문턱
const machine = (x: (typeof sc)[number]) => {
  const rest = sc.filter((y) => y.ch !== x.ch);
  const hiSame = Math.max(...rest.filter((y) => !y.정답).map((y) => y.s));
  const loDiff = Math.min(...rest.filter((y) => y.정답).map((y) => y.s));
  if (x.s > hiSame) return true;
  if (x.s < loDiff) return false;
  return null;
};
console.log("");
judge("A luna 혼자", (x) => ({ same: pOf(luna, x.이름) >= 0.5, usd: LUNA, by: "luna" }));
const b = judge("B gpt-5 혼자", (x) => ({ same: pOf(big, x.이름) >= 0.5, usd: BIG, by: "gpt-5" }));
judge("C τ0.8", cOf(0.8));
judge("C τ0.93", cOf(0.93));
const res: Record<string, { hit: number; fp: number; usd: number }> = {};
for (const tau of [0.8, 0.93]) {
  res[tau] = judge(`D 기계+C τ${tau}`, (x) => { const m = machine(x); return m === null ? cOf(tau)(x) : { same: m, usd: 0, by: "기계" }; });
}
judge("기계 혼자(참고·부풂)", (x) => ({ same: machine(x) ?? x.s >= (Math.max(...sc.filter((y) => !y.정답).map((y) => y.s)) + Math.min(...sc.filter((y) => y.정답).map((y) => y.s))) / 2, usd: 0, by: "기계" }));
for (const tau of [0.8, 0.93]) {
  const d = res[tau];
  console.log(`판정 D τ${tau}: ${d.hit >= 16 && d.fp <= 1 && d.usd <= b.usd * 0.5 ? "쓸 만하다" : "못 쓴다"} (값 ${((d.usd / b.usd) * 100).toFixed(0)}%)`);
}
