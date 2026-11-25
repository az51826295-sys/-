// 이미 산 4방향 원본을 새 길로 다시 돌린다(그리기·판단자 0원). npx tsx replay_any.mts <참조 1x png> <원본 raw png> <출력 1x png>
for (const l of (await import("node:fs")).readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim(); }
import { readFileSync, writeFileSync } from "node:fs";
const [ref, raw, out, mv = "turn"] = process.argv.slice(2);
process.env.PIXEL_MOTION_MOCK = raw;
const { makeMotion, sheetOf } = await import("../../../../src/lib/pixel/motion");
const r = await makeMotion(readFileSync(ref), mv as "turn", { maxTries: 1 });
console.log(r.ok, r.ok ? [r.set.cellW, r.set.cellH] : r.reason, "| 사실:", JSON.stringify(r.check?.facts));
if (r.ok) writeFileSync(out, await sheetOf(r.cuts, r.set));
