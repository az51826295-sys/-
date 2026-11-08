/** 429 가 무엇 때문인가 — 한도 이름과 다시 되는 시각을 그대로 적는다. 11-08. 열쇠는 안 찍는다. */
import { readFileSync } from "node:fs";
const KEY = JSON.parse(readFileSync(`${process.env.LOCALAPPDATA}/rookery-dot/gemini.json`, "utf8")).apiKey as string;
const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent", {
  method: "POST",
  headers: { "x-goog-api-key": KEY, "content-type": "application/json" },
  body: JSON.stringify({ contents: [{ parts: [{ text: "a red dot" }] }], generationConfig: { responseModalities: ["IMAGE"] } }),
});
console.log(`HTTP ${r.status}`);
const 글 = await r.text();
try {
  const j = JSON.parse(글);
  console.log(j.error?.message ?? 글.slice(0, 400));
  for (const d of j.error?.details ?? []) {
    if (d["@type"]?.includes("QuotaFailure")) for (const v of d.violations ?? []) console.log(`  한도: ${v.quotaMetric ?? v.quotaId} = ${v.quotaValue ?? "?"}`);
    if (d["@type"]?.includes("RetryInfo")) console.log(`  다시: ${d.retryDelay}`);
    if (d["@type"]?.includes("Help")) for (const l of d.links ?? []) console.log(`  도움: ${l.url}`);
  }
} catch { console.log(글.slice(0, 400)); }

/* 글 모델은 되나 — 열쇠 자체가 살아 있는지 견주는 대조군 */
const t = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
  method: "POST", headers: { "x-goog-api-key": KEY, "content-type": "application/json" },
  body: JSON.stringify({ contents: [{ parts: [{ text: "say ok" }] }] }),
});
console.log(`\n대조군(글 모델 gemini-2.5-flash) HTTP ${t.status}`);
