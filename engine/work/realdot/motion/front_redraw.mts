// 사선이던 캐릭터를 정면 확인이 들어간 만들기로 다시 → 코드 걷기(rigwalk)까지(11-26). 한 종 약 30~60원.
//   npx tsx engine/work/realdot/motion/front_redraw.mts mage skeleton
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim(); }
process.env.PIXEL_CREATE_MOCK = ""; process.env.PIXEL_MOTION_MOCK = "";
const DESC: Record<string, string> = {
  knight: "철 갑옷을 입고 검과 방패를 든 기사", mage: "파란 로브와 뾰족 모자, 지팡이를 든 마법사", rogue: "검은 두건과 단검을 든 도적",
  priest: "흰 로브에 금색 장식, 지팡이를 든 성직자", merchant: "큰 배낭을 멘 통통한 상인", goblin: "녹색 피부에 몽둥이를 든 고블린",
  skeleton: "녹슨 칼을 든 해골 병사", slime: "초록색 슬라임 몬스터", bat: "보라색 박쥐 몬스터",
};
const OLD = "C:/Users/az518/Desktop/두근도트-스레드/itch-pack2";
const OUT = "C:/Users/az518/Desktop/두근도트-스레드/itch-pack3"; mkdirSync(OUT, { recursive: true });
const { makeCharacter } = await import("../../../../src/lib/pixel/create");
const { rigWalk } = await import("../../../../src/lib/pixel/rigwalk");
const anchor = readFileSync(`${OLD}/archer/front.png`);
let total = 0;
for (const n of process.argv.slice(2)) {
  const t0 = Date.now();
  const c = await makeCharacter(DESC[n], 64, { game: [anchor] }); total += c.usd;
  console.log(n, c.ok ? "ok" : "실패", `$${c.usd.toFixed(4)}`, `${((Date.now() - t0) / 1000).toFixed(0)}초`, c.facts.slice(0, 3).join(" | "));
  if (!c.ok) continue;
  mkdirSync(`${OUT}/${n}`, { recursive: true });
  writeFileSync(`${OUT}/${n}/front.png`, c.png);
  const r = await rigWalk(c.png);
  console.log("  걷기", r.mode, r.facts.join(" · "));
  const sheet = await sharp({ create: { width: r.cellW * 4, height: r.cellH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(r.frames.map((input, i) => ({ input, raw: { width: r.cellW, height: r.cellH, channels: 4 as const }, left: i * r.cellW, top: 0 }))).png().toBuffer();
  writeFileSync(`${OUT}/${n}/walk-1x.png`, sheet);
}
console.log(`합계 $${total.toFixed(4)}`);
