// 정면 판단자가 지금 팩의 사선 4종(마법사·상인·고블린·해골)을 잡나 — 자를 먼저 잰다(11-26). 약 10원.
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim(); }
process.env.PIXEL_CREATE_MOCK = "";
const { judgeFront } = await import("../../../../src/lib/pixel/create");
const R = process.env.PACK_ROOT || "C:/Users/az518/Desktop/두근도트-스레드/itch-pack2";
let usd = 0;
for (const n of process.argv.slice(2)) {
  const j = await judgeFront(readFileSync(`${R}/${n}/front.png`));
  if (!j) { console.log(n, "판단 없음"); continue; }
  usd += j.usd; console.log(n.padEnd(9), j.front ? "정면" : "비스듬", j.confidence.toFixed(2), j.why.slice(0, 90));
}
console.log(`합계 $${usd.toFixed(4)}`);
