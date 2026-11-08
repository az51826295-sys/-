/** 열쇠 파일이 여럿이다 — 그중 **그림이 되는** OpenAI 열쇠가 하나라도 있나. 11-08.
 *  **값은 찍지 않는다.** 어느 파일의 어느 칸인지와 HTTP 상태만 적는다. */
import { readFileSync, readdirSync } from "node:fs";
const 칸 = `${process.env.LOCALAPPDATA}/rookery-dot`;

type 후보 = { 어디: string; 열쇠: string };
const 후보들: 후보[] = [];
const 본것 = new Set<string>();

function 파기(어디: string, v: unknown, 길: string[] = []) {
  if (typeof v === "string") {
    if (/^sk-/.test(v) && v.length > 30 && !본것.has(v)) { 본것.add(v); 후보들.push({ 어디: `${어디}:${길.join(".") || "?"}`, 열쇠: v }); }
    return;
  }
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, unknown>)) 파기(어디, x, [...길, k]);
}

for (const f of readdirSync(칸)) {
  if (!f.endsWith(".json")) continue;
  try { 파기(f, JSON.parse(readFileSync(`${칸}/${f}`, "utf8"))); } catch { /* 못 읽으면 넘어간다 */ }
}
/* .env.local 것도 대조군으로 */
try {
  for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
    const i = l.indexOf("=");
    if (i > 0 && l.slice(0, i).trim() === "OPENAI_API_KEY") 파기(".env.local", l.slice(i + 1).trim(), ["OPENAI_API_KEY"]);
  }
} catch { /* 없으면 없는 대로 */ }

console.log(`sk- 로 시작하는 서로 다른 열쇠 ${후보들.length}개를 찾았다. 하나씩 두드린다.\n`);
for (const c of 후보들) {
  const r = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${c.열쇠}` } });
  let 꼬리 = "";
  if (r.ok) {
    const j = (await r.json()) as { data?: { id: string }[] };
    const 그림 = (j.data ?? []).filter((m) => /image/.test(m.id)).map((m) => m.id);
    꼬리 = `· 모델 ${j.data?.length ?? 0}개 · 그림 ${그림.length}개 ${그림.slice(0, 4).join(",")}`;
  }
  console.log(`${r.status === 200 ? "✅ 열림 " : r.status === 401 ? "🔑 틀림 " : r.status === 429 ? "💸 한도 " : `◻︎ ${r.status}  `} ${c.어디.padEnd(42)} ${꼬리}`);
}
