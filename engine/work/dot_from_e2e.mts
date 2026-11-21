/**
 * 꼬리표 한 바퀴(11-22): ?from=selftest 로 들어와 → 방(/dot/yuna)에 들어가 손님 계정이 생기면 →
 * 그 계정에 came_from=selftest 가 적혔나. 대조: 꼬리표 없이 들어온 새 브라우저는 came_from 이 없어야 한다.
 * 끝나면 시험으로 만든 손님 계정 둘을 지운다(내가 만든 것만, id 로).
 *   BASE=http://localhost:3000 npx tsx engine/work/dot_from_e2e.mts
 */
import puppeteer from "puppeteer-core";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

async function 한사람(from: string | null): Promise<string | null> {
  const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.goto(`${BASE}/dot${from ? `?from=${from}` : ""}`, { waitUntil: "networkidle2", timeout: 180000 });
  await new Promise((r) => setTimeout(r, 1500));
  const 쿠키 = (await p.cookies()).find((c) => c.name === "dot_from")?.value ?? null;
  const 응답 = p.waitForResponse((r) => r.url().includes("/api/dot/guest"), { timeout: 180000 });
  await p.goto(`${BASE}/dot/yuna`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const r = await 응답;
  const j = await r.json().catch(() => ({}));
  await new Promise((r) => setTimeout(r, 1500));
  // 세션 쿠키에서 사용자 id 를 꺼낸다(sb-…-auth-token).
  const 세션 = (await p.cookies()).filter((c) => c.name.includes("auth-token")).map((c) => c.value).join("");
  await b.close();
  let id: string | null = null;
  try { const raw = 세션.startsWith("base64-") ? Buffer.from(세션.slice(7), "base64").toString() : decodeURIComponent(세션); id = JSON.parse(raw).user?.id ?? null; } catch { /* 아래에서 드러난다 */ }
  console.log(`  꼬리표 ${from ?? "(없음)"} → 쿠키 ${쿠키 ?? "(없음)"} · guest ${r.status()} ${JSON.stringify(j)} · 계정 ${id ? id.slice(0, 8) : "못 찾음"}`);
  return id;
}

let 맞음 = 0, 틀림 = 0;
const 봄 = (이름: string, ok: boolean, 보임 = "") => { ok ? 맞음++ : 틀림++; console.log(`${ok ? "✅" : "❌"} ${이름}${보임 ? ` — ${보임}` : ""}`); };
const 만든: string[] = [];
try {
  const a = await 한사람("selftest"); if (a) 만든.push(a);
  const ua = a ? (await db.auth.admin.getUserById(a)).data.user : null;
  봄("꼬리표 달고 온 사람의 계정에 came_from 이 적힌다", ua?.user_metadata?.came_from === "selftest", String(ua?.user_metadata?.came_from));
  const c = await 한사람(null); if (c) 만든.push(c);
  const uc = c ? (await db.auth.admin.getUserById(c)).data.user : null;
  봄("대조: 꼬리표 없이 온 사람은 came_from 이 없다", !!uc && uc.user_metadata?.came_from === undefined, String(uc?.user_metadata?.came_from));
} finally {
  for (const id of 만든) { const { error } = await db.auth.admin.deleteUser(id); console.log(`  시험 계정 ${id.slice(0, 8)} 지움${error ? ` 실패: ${error.message}` : ""}`); }
}
console.log(`\n${맞음}/${맞음 + 틀림}`);
process.exit(틀림 ? 1 : 0);
