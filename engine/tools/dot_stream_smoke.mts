/** 흘려보내기 배관 시험 — 숨은 시험 캐릭터에게 한 마디. 글자가 조각으로 오는지, 끝에 표정·친밀도가 오는지. */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] ||= l.slice(i+1).trim();
}
process.env.AI_PROVIDER = "deepseek";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { streamDotTurn } = await import("../../src/lib/dot/turn");
const USER = "aad3d48c-c92f-492b-bc9e-ce36b7094a12", CHAR = "dcb3de9a-d79e-4fb0-b094-9de64214b288";
const t0 = Date.now(); let first = 0, chunks = 0, acc = "";
const r = await streamDotTurn(createServiceClient(), USER, CHAR, "오늘 날씨 좋다, 뭐 하고 있었어?", (c) => { if (!first) first = Date.now() - t0; chunks++; acc += c; });
console.log(`첫 글자 ${first}ms · 조각 ${chunks}개 · 합 ${Date.now() - t0}ms`);
console.log(`흘러온 글: ${acc}`);
console.log(`결과:`, r.ok ? `${r.reply} · ${r.emotion} · ${r.bond.points}점 · 남은 ${r.remaining}` : r);
if (!r.ok || acc !== r.reply) { console.log("❌ 흘러온 글과 최종 답이 다르다"); process.exit(1); }
console.log("✅ 흘러온 글 = 최종 답");
