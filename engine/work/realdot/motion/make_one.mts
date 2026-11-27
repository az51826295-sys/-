// 11-27 글로 캐릭터 하나 만들기(사이트 만들기와 같은 길, 약 28원) → rival/<이름>/front.png
//   npx tsx make_one.mts king "기사왕" 64
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
process.chdir("C:/Users/az518/Desktop/ai-workforce");
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim(); }
process.env.PIXEL_CREATE_MOCK = "";
const { makeCharacter } = await import("../../../../src/lib/pixel/create");
const [name, desc, size] = process.argv.slice(2);
const r = await makeCharacter(desc, Number(size ?? 64) as 64);
if (!r.ok) { console.log("실패", r.reason); process.exit(1); }
const out = `C:/Users/az518/Desktop/두근도트-스레드/rival/${name}`; mkdirSync(out, { recursive: true });
writeFileSync(`${out}/front.png`, (r as unknown as { png: Buffer }).png);
console.log(`${name} 만듦 $${r.usd.toFixed(4)} · ${r.facts.slice(-3).join(" | ")}`);
