/** GEMINI 열쇠가 살아 있나 + 그림 그리는 모델이 열려 있나. 값은 안 찍는다. 11-08. */
const k = process.env.GEMINI_API_KEY;
console.log(`GEMINI_API_KEY ${k ? `있음 (…${k.slice(-4)})` : "없음"}`);
if (!k) process.exit(0);
const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${k}&pageSize=200`);
console.log(`models 목록 HTTP ${r.status}`);
if (!r.ok) { console.log((await r.text()).slice(0, 200)); process.exit(0); }
const j = (await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
const 전부 = j.models ?? [];
console.log(`열린 모델 ${전부.length}개`);
const 그림 = 전부.filter((m) => /image|imagen|banana/i.test(m.name));
console.log(`그림 쪽 ${그림.length}개:`);
for (const m of 그림) console.log(`  ${m.name.replace("models/", "")}  [${(m.supportedGenerationMethods ?? []).join(",")}]`);
