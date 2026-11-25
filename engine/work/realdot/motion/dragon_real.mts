/**
 * 글로 만들기 첫 실제 판 (11-25, 사장님 "용그려봐") — "용" · 기본 그림체 · 64px · 그림 1번(다시 시도 없음).
 *   npx tsx engine/work/realdot/motion/dragon_real.mts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
delete process.env.PIXEL_CREATE_MOCK;
const OUT = "C:/Users/az518/Desktop/두근도트-스레드/realdot/first-create"; mkdirSync(OUT, { recursive: true });
const { makeCharacter } = await import("../../../../src/lib/pixel/create");
const t0 = Date.now();
const r = await makeCharacter("용", 64);
const sec = ((Date.now() - t0) / 1000).toFixed(0);
if (r.ok) {
  writeFileSync(`${OUT}/raw.png`, r.raw);
  writeFileSync(`${OUT}/dragon-1x.png`, r.png);
  writeFileSync(`${OUT}/dragon-big.png`, r.big);
}
const out = { ok: r.ok, usd: r.usd, sec, facts: r.facts, ...(r.ok ? { drawn: r.drawn, size: r.size } : { reason: r.reason }) };
writeFileSync(`${OUT}/result.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
