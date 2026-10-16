/**
 * **베타 페이지가 실제 식구를 말하나** (10-16). 모델 0 · 값 0.
 *   npx tsx engine/tools/dot_베타_식구.mts [--sabotage]
 *
 * 10-16 에 이 줄이 **"유나 · 서하 · 린 · 도윤 네 명"** 이라고 손으로 적혀 있었다.
 * 실제로는 여섯 명이고 **도윤은 없는 캐릭터**다 — 인스타가 보내는 착지 페이지가
 * 없는 사람을 안내하고 있었다. 글자로 적힌 안내는 조용히 낡는데 아무 자도 안 봤다.
 *
 * **불평 하나에 자 하나.** DB 의 공개 캐릭터와 **올라간 페이지의 글자**를 맞대어 본다.
 * 코드를 읽지 않는다 — 올라간 것이 뭐라고 말하는지가 사람이 보는 것이다.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.trimStart().startsWith("#") && !(l.slice(0, i).trim() in process.env)) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

const 터 = process.env.DOT_URL ?? "https://dot-web-production-7e03.up.railway.app";
let 나쁨 = 0;
const 재기 = (n: string, ok: boolean, 본?: unknown) => { if (!ok) 나쁨++; console.log(ok ? "통과" : "실패", n, ok ? "" : JSON.stringify(본, null, 0)); };

const { data, error } = await db.from("dot_characters").select("name").eq("is_public", true).order("created_at", { ascending: true });
if (error) { console.error("DB 를 못 읽었다 — **못 잼**:", error.message); process.exit(1); }
let 식구 = (data ?? []).map((c) => c.name as string).filter(Boolean);
/* 심은 고장: DB 쪽을 한 명 어긋나게 만든다 — 자가 침묵하면 자에 이빨이 없는 것이다 */
if (process.argv.includes("--sabotage")) 식구 = [...식구.slice(0, -1), "없는사람"];

const 글 = await fetch(`${터}/dot/beta`, { signal: AbortSignal.timeout(25_000) }).then((r) => r.text());
const 본문 = 글.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

재기(`페이지가 열린다`, 글.length > 500, { 글자: 글.length });
for (const 이름 of 식구) 재기(`"${이름}" 이 페이지에 있다`, 본문.includes(이름));

/* **없는 사람을 말하지 않는가** — 10-16 의 진짜 고장은 이쪽이었다(도윤).
   첫 판에 페이지 다른 곳의 "상태말" 까지 이름으로 집어 거짓 양성을 냈다. 그래서
   **식구를 말하는 그 줄만** 떼어 거기서만 센다 — 자가 엉뚱한 데를 보면 못 믿는다. */
const 식구줄 = 본문.match(/지금[^.]*명이 있어요/)?.[0] ?? "";
재기("식구를 말하는 줄이 있다", !!식구줄, { 본문앞: 본문.slice(0, 200) });
const 한글이름 = [...식구줄.matchAll(/([가-힣]{2,3})(?= · |(?: 여섯| 다섯| 네| 세| 두) 명)/g)].map((m) => m[1]);
const 군더더기 = [...new Set(한글이름)].filter((n) => !식구.includes(n) && n !== "지금");
재기("없는 캐릭터를 안내하지 않는다", 군더더기.length === 0, { 군더더기, 식구줄, 식구 });

/* 숫자도 맞나 */
const 셈 = { 1: "한", 2: "두", 3: "세", 4: "네", 5: "다섯", 6: "여섯", 7: "일곱" }[식구.length];
재기(`"${셈} 명" 이라고 적혀 있다`, !셈 || 본문.includes(`${셈} 명`), { 바란것: `${셈} 명`, 식구수: 식구.length });

console.log(`\n식구 ${식구.length}명: ${식구.join(" · ")}`);
console.log(나쁨 === 0 ? "전부 통과" : `실패 ${나쁨}건`);
process.exit(나쁨 === 0 ? 0 : 1);
