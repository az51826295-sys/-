/**
 * 공정 비교 4캐릭터 (11-25, 사장님 "하고 홍보로 ㄱㄱ") — 같은 영어 글 · 64칸 · 4방향. 우리는 손님과 똑같은 길(만들기 → 4방향, 기본 설정).
 * 픽셀랩은 create-character-with-4-directions(기본 설정, view side). 키는 환경변수 PIXELLAB_TOKEN 으로만.
 *   PIXELLAB_TOKEN=... npx tsx engine/work/realdot/motion/compare4.mts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
delete process.env.PIXEL_MOTION_MOCK; delete process.env.PIXEL_CREATE_MOCK;
const TOK = process.env.PIXELLAB_TOKEN ?? "";
const R = "C:/Users/az518/Desktop/두근도트-스레드/realdot/compare4";
const { makeCharacter } = await import("../../../../src/lib/pixel/create");
const { makeMotion, sheetOf } = await import("../../../../src/lib/pixel/motion");
const CHARS: [string, string][] = [
  ["knight", "a knight in silver armor with a red cape"],
  ["cat", "an orange cat"],
  ["slime", "a green slime monster"],
  ["wizard", "an old wizard with a blue robe and a staff"],
];
const H = { Authorization: `Bearer ${TOK}`, "content-type": "application/json" };
async function pixellab(desc: string, dir: string) {
  const t0 = Date.now();
  const r = await fetch("https://api.pixellab.ai/v2/create-character-with-4-directions", { method: "POST", headers: H, body: JSON.stringify({ description: desc, image_size: { width: 64, height: 64 }, view: "side" }) });
  let j: any = await r.json().catch(() => ({}));
  const id = j.background_job_id;
  for (let i = 0; i < 72 && id && !j.images; i++) {
    await new Promise((s) => setTimeout(s, 5000));
    const k: any = await (await fetch(`https://api.pixellab.ai/v2/background-jobs/${id}`, { headers: H })).json().catch(() => ({}));
    if (k.status === "completed" || k.last_response?.images) { j = k.last_response ?? k; break; }
    if (k.status === "failed") { return { ok: false, why: JSON.stringify(k).slice(0, 200) }; }
  }
  const imgs = j.images ?? {};
  for (const [d, v] of Object.entries<any>(imgs)) writeFileSync(`${dir}/pl-${d}.png`, Buffer.from(String(v?.base64 ?? v).replace(/^data:image\/\w+;base64,/, ""), "base64"));
  return { ok: Object.keys(imgs).length === 4, sec: ((Date.now() - t0) / 1000).toFixed(0) };
}
const log: unknown[] = []; let usd = 0;
for (const [name, desc] of CHARS) {
  const dir = `${R}/${name}`; mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  const c = await makeCharacter(desc, 64);
  usd += c.usd;
  let ours: Record<string, unknown> = { create: c.ok };
  if (c.ok) {
    writeFileSync(`${dir}/ours-1x.png`, c.png);
    const m = await makeMotion(c.png, "turn"); // 손님 길 그대로(다시 그리기 1번까지)
    usd += m.usd;
    if ("raw" in m && m.raw) writeFileSync(`${dir}/ours-turn-raw.png`, m.raw);
    if (m.ok) writeFileSync(`${dir}/ours-turn-1x.png`, await sheetOf(m.cuts, m.set));
    ours = { create: true, turn: m.ok, tries: m.tries, usd: +(c.usd + m.usd).toFixed(4), facts: m.check?.facts, reason: m.ok ? undefined : m.reason };
  } else ours = { create: false, reason: c.reason, usd: c.usd };
  ours.sec = ((Date.now() - t0) / 1000).toFixed(0);
  const pl = TOK ? await pixellab(desc, dir) : { ok: false, why: "토큰 없음" };
  const row = { name, desc, ours, pixellab: pl };
  log.push(row); console.log(JSON.stringify(row));
}
console.log(`우리 합계 $${usd.toFixed(4)}`);
writeFileSync(`${R}/result.json`, JSON.stringify(log, null, 2));
// 한 장 비교표: 줄마다 [우리 4방향 | 픽셀랩 4방향]
const S = 3, cell = 92 * S, gap = 10;
const comp: sharp.OverlayOptions[] = [];
let y = 0;
for (const [name] of CHARS) {
  const dir = `${R}/${name}`;
  try {
    const sheet = readFileSync(`${dir}/ours-turn-1x.png`); const m = await sharp(sheet).metadata(); const cw = m.width! / 4;
    for (let i = 0; i < 4; i++) { const b = await sharp(sheet).extract({ left: Math.round(i * cw), top: 0, width: Math.round(cw), height: m.height! }).resize({ height: m.height! * S, kernel: "nearest" }).png().toBuffer(); comp.push({ input: b, left: i * (cell / 1.4 + gap) + 8, top: y + 8 }); }
  } catch { /* 우리 실패 */ }
  try {
    let i = 0; for (const d of ["south", "east", "north", "west"]) { const b = await sharp(readFileSync(`${dir}/pl-${d}.png`)).resize({ height: 92 * S, kernel: "nearest" }).png().toBuffer(); comp.push({ input: b, left: 4 * (cell / 1.4 + gap) + 60 + i * (cell * 0.75 + gap), top: y }); i++; }
  } catch { /* 픽셀랩 실패 */ }
  y += cell + 20;
}
await sharp({ create: { width: Math.round(4 * (cell / 1.4 + gap) + 60 + 4 * (cell * 0.75 + gap) + 20), height: y, channels: 4, background: "#ffffff" } }).composite(comp.map((o) => ({ ...o, left: Math.round(o.left as number), top: Math.round(o.top as number) }))).png().toFile(`${R}/compare4-all.png`);
console.log("ok");
