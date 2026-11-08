/** OpenAI 열쇠가 죽었다. 그림을 그릴 다른 길이 살아 있나 — Gemini·PixelLab. 11-08.
 *  **열쇠 값은 어디에도 찍지 않는다.** 상태 코드와 모델 이름만 적는다. */
import { readFileSync, existsSync } from "node:fs";
const 칸 = `${process.env.LOCALAPPDATA}/rookery-dot`;

function 집기(파일: string, ...후보: string[]): string | null {
  const p = `${칸}/${파일}`;
  if (!existsSync(p)) return null;
  try {
    const j = JSON.parse(readFileSync(p, "utf8"));
    for (const k of 후보) if (typeof j[k] === "string" && j[k]) return j[k];
    for (const v of Object.values(j)) if (typeof v === "string" && v.length > 20) return v;
  } catch { /* 못 읽으면 없는 것으로 */ }
  return null;
}

/* ── Gemini ── */
const g = 집기("gemini.json", "apiKey", "key", "GEMINI_API_KEY");
if (!g) console.log("Gemini    열쇠 파일에서 못 찾음");
else {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200`, { headers: { "x-goog-api-key": g } });
  console.log(`Gemini    HTTP ${r.status}`);
  if (r.ok) {
    const j = (await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
    const 전부 = j.models ?? [];
    const 그림 = 전부.filter((m) => /image|imagen|banana/i.test(m.name));
    console.log(`          열린 모델 ${전부.length}개 · 그림 쪽 ${그림.length}개`);
    for (const m of 그림.slice(0, 12)) console.log(`            ${m.name.replace("models/", "")}`);
  } else console.log("          " + (await r.text()).slice(0, 160));
}

/* ── PixelLab ── */
const p = 집기("pixellab.json", "apiKey", "key");
if (!p) console.log("PixelLab  열쇠 파일에서 못 찾음");
else {
  const r = await fetch("https://api.pixellab.ai/v1/balance", { headers: { Authorization: `Bearer ${p}` } });
  console.log(`PixelLab  HTTP ${r.status}  ${r.ok ? (await r.text()).slice(0, 120) : (await r.text()).slice(0, 160)}`);
}
