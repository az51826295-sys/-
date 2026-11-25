import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim(); }
delete process.env.PIXEL_CREATE_MOCK; process.env.PIXEL_SABOTAGE_FIRST_FIT = "1";
const { makeCharacter } = await import("../../../../src/lib/pixel/create");
const D = "C:/Users/az518/Desktop/두근도트-시트";
const c = await makeCharacter("a boy with short red hair and a school uniform", 48, { game: [readFileSync(`${D}/taeo-strip.png`), readFileSync(`${D}/haru-strip.png`)], snap: true });
console.log(JSON.stringify({ ok: c.ok, usd: c.usd, facts: c.facts, why: c.ok ? undefined : c.reason }));
