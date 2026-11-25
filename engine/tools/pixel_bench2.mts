/**
 * 실패율 자 2 (11-25, 사장님 "나머지 해") — 1~5바퀴에서 **안 잰 길**: 숨쉬기 · 손 흔들기 · 글로 쓴 동작 · 내 게임 그림체(만들기 → 4방향).
 * 손님 길 그대로(라우트가 부르는 makeCharacter · makeMotion, 기본 설정). 돈 듦: 약 $0.6.
 *   npx tsx engine/tools/pixel_bench2.mts [회차]
 * 센다(먼저 적음): 결과 없음 · 배경 번짐 점(파란 기운 ≥38 · 투명과 맞닿음) · 미끄러짐(윗몸 가운데 >1.5칸) · 걸린 시간 · 판단자 말.
 * 사람 눈 확인용 한 장(bench2-all.png).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import sharp from "sharp";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
delete process.env.PIXEL_MOTION_MOCK; delete process.env.PIXEL_CREATE_MOCK;
const RUN = process.argv[2] ?? "s1";
const OUT = `C:/Users/az518/Desktop/두근도트-스레드/realdot/bench2/${RUN}`; mkdirSync(OUT, { recursive: true });
const { makeCharacter } = await import("../../src/lib/pixel/create");
const { makeMotion, sheetOf } = await import("../../src/lib/pixel/motion");
const PIXEL_BG = [0xb0, 0xc4, 0xde];
const CHARS: [string, string, 32 | 48 | 64 | 96, string][] = [
  ["knight", "a young knight in blue armor with a sword and a round shield", 64, "swing the sword from above the head down to the front"],
  ["witch", "a little witch with a purple hat and a broom", 48, "cast a spell: raise the hand and a small magic spark appears"],
  ["archer", "an elf archer with a green hood and a bow", 64, "draw the bow and shoot an arrow"],
  ["golem", "a stone golem with glowing blue cracks", 96, "punch forward with the right fist"],
  ["pig", "a cute pink pig merchant with a backpack", 32, "jump up and land"],
];
const D = "C:/Users/az518/Desktop/두근도트-시트"; // 게임 그림체 시험용: 두근도트 캐릭터 띠(사장님 게임 그림)
const GAME = [readFileSync(`${D}/taeo-strip.png`), readFileSync(`${D}/haru-strip.png`)];
const GAME_CHARS: [string, string][] = [["g-boy", "a boy with short red hair and a school uniform"], ["g-girl", "a girl with long black hair and a yellow raincoat"]];
async function specks(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); const W = info.width, H = info.height; let n = 0;
  const near = (i: number) => data[i + 2] - data[i] >= 38 && Math.abs(data[i] - PIXEL_BG[0]) + Math.abs(data[i + 1] - PIXEL_BG[1]) + Math.abs(data[i + 2] - PIXEL_BG[2]) < 80;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (!data[i + 3] || !near(i)) continue; if ([[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([a, b]) => a < 0 || b < 0 || a >= W || b >= H || !data[(b * W + a) * 4 + 3])) n++; }
  return n;
}
async function drift(png: Buffer) {
  const m = await sharp(png).metadata(); const cw = Math.floor(m.width! / 4), H = m.height!;
  const xs = await Promise.all([0, 1, 2, 3].map(async (i) => { const b = await sharp(png).extract({ left: i * cw, top: 0, width: cw, height: H }).ensureAlpha().raw().toBuffer(); let sx = 0, n = 0; for (let y = 0; y < H / 2; y++) for (let x = 0; x < cw; x++) if (b[(y * cw + x) * 4 + 3]) { sx += x; n++; } return n ? sx / n : 0; }));
  return +(Math.max(...xs) - Math.min(...xs)).toFixed(1);
}
const rows: Record<string, unknown>[] = []; let usd = 0;
async function motion(name: string, ref: Buffer, mv: "idle" | "wave" | "custom" | "turn", action?: string) {
  const t0 = Date.now();
  const m = await makeMotion(ref, mv, { action });
  usd += m.usd;
  const row: Record<string, unknown> = { name, mv, ok: m.ok, tries: m.tries, usd: +m.usd.toFixed(4), sec: +((Date.now() - t0) / 1000).toFixed(0), facts: m.check?.facts, judge: m.check?.judge?.why };
  if ("raw" in m && m.raw) writeFileSync(`${OUT}/${name}-${mv}-raw.png`, m.raw);
  if (m.ok) { const s = await sheetOf(m.cuts, m.set); writeFileSync(`${OUT}/${name}-${mv}-1x.png`, s); row.specks = await specks(s); row.drift = mv === "turn" ? undefined : await drift(s); }
  else row.why = m.reason;
  rows.push(row); console.log(JSON.stringify({ ...row, facts: undefined, judge: undefined }));
}
for (const [name, desc, size, act] of CHARS) {
  const t0 = Date.now();
  const c = await makeCharacter(desc, size); usd += c.usd;
  rows.push({ name, mv: "create", ok: c.ok, size, usd: +c.usd.toFixed(4), sec: +((Date.now() - t0) / 1000).toFixed(0), facts: c.facts, why: c.ok ? undefined : c.reason, specks: c.ok ? await specks(c.png) : undefined });
  console.log(JSON.stringify({ name, mv: "create", ok: c.ok, sec: rows[rows.length - 1].sec }));
  if (!c.ok) continue;
  writeFileSync(`${OUT}/${name}-1x.png`, c.png);
  await motion(name, c.png, "idle"); await motion(name, c.png, "wave"); await motion(name, c.png, "custom", act);
}
for (const [name, desc] of GAME_CHARS) {
  const t0 = Date.now();
  const c = await makeCharacter(desc, 48, { game: GAME, snap: true }); usd += c.usd;
  rows.push({ name, mv: "create-game", ok: c.ok, usd: +c.usd.toFixed(4), sec: +((Date.now() - t0) / 1000).toFixed(0), facts: c.facts, why: c.ok ? undefined : c.reason });
  console.log(JSON.stringify({ name, mv: "create-game", ok: c.ok, facts: c.facts }));
  if (!c.ok) continue;
  writeFileSync(`${OUT}/${name}-1x.png`, c.png);
  await motion(name, c.png, "turn");
}
writeFileSync(`${OUT}/result.json`, JSON.stringify(rows, null, 2));
const fail = rows.filter((r) => !r.ok).map((r) => `${r.name}-${r.mv}`);
const spk = rows.reduce((s, r) => s + Number(r.specks ?? 0), 0);
const slid = rows.filter((r) => Number(r.drift ?? 0) > 1.5).map((r) => `${r.name}-${r.mv}(${r.drift})`);
const slow = rows.filter((r) => Number(r.sec) > 60).map((r) => `${r.name}-${r.mv}(${r.sec}초)`);
console.log(`\n결과 없음 ${fail.length}/${rows.length} ${fail.join(",")} · 점 ${spk} · 미끄러짐 ${slid.join(",") || "없음"} · 60초 넘음 ${slow.join(",") || "없음"} · 합계 $${usd.toFixed(4)}`);
// 사람 눈 확인용
const S = 2, comp: sharp.OverlayOptions[] = []; let y = 0, Wmax = 0;
for (const [name] of [...CHARS, ...GAME_CHARS]) {
  let x = 0, h = 0;
  for (const f of [`${name}-1x.png`, `${name}-idle-1x.png`, `${name}-wave-1x.png`, `${name}-custom-1x.png`, `${name}-turn-1x.png`]) {
    const p = `${OUT}/${f}`; if (!existsSync(p)) continue;
    const m = await sharp(p).metadata(); comp.push({ input: await sharp(p).resize(m.width! * S, m.height! * S, { kernel: "nearest" }).png().toBuffer(), left: x, top: y }); x += m.width! * S + 20; h = Math.max(h, m.height! * S);
  }
  Wmax = Math.max(Wmax, x); y += h + 14;
}
await sharp({ create: { width: Math.max(Wmax, 10), height: Math.max(y, 10), channels: 4, background: "#ffffff" } }).composite(comp).png().toFile(`${OUT}/bench2-all.png`);
console.log("ok");
