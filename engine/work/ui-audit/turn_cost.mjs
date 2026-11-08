/**
 * **대화 한 번에 얼마 드나** — 어림이 아니라 `dot_turns` 원장의 토큰으로 센다 (11-06).
 *
 * `dot_하루값.mts` 는 입력 2000·출력 300 토큰으로 **어림**했다. 그런데 원장에 진짜 토큰이
 * 있다(`input_tokens`·`cached_tokens`·`output_tokens`) — 어림할 이유가 없다.
 * 캐시가 원가의 몸통이라 캐시된 토큰은 따로 세야 한다(안 그러면 31배 비싸게 나온다).
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/* deepseek-v4-flash 공개 단가(백만 토큰당) · 환율은 selfcheck 와 같은 값을 쓴다. */
const IN = 0.44 / 1e6, CACHE = 0.014 / 1e6, OUT = 1.32 / 1e6, KRW = 1380;
const 날수 = Number(process.argv[2] ?? 60);
const 부터 = new Date(Date.now() - 날수 * 864e5).toISOString();

const { data, error } = await db.from("dot_turns")
  .select("input_tokens, cached_tokens, output_tokens, model, created_at").gte("created_at", 부터).limit(20000);
if (error) { console.log("못 읽음:", error.message); process.exit(1); }
const rows = data ?? [];
if (!rows.length) { console.log(`최근 ${날수}일 턴 기록이 없다 — 못 잰다`); process.exit(0); }

const 값 = (r) => ((r.input_tokens - (r.cached_tokens ?? 0)) * IN + (r.cached_tokens ?? 0) * CACHE + r.output_tokens * OUT) * KRW;
const 값들 = rows.map(값).sort((a, b) => a - b);
const 중간 = 값들[Math.floor(값들.length / 2)];
const 합 = 값들.reduce((a, b) => a + b, 0);
const inAll = rows.reduce((a, r) => a + r.input_tokens, 0);
const hit = rows.reduce((a, r) => a + (r.cached_tokens ?? 0), 0);
const 모델 = [...new Set(rows.map((r) => r.model))].join(", ");

console.log(`\n=== 대화 한 번 값 (최근 ${날수}일, 턴 ${rows.length}개) ===`);
console.log(`  모델: ${모델}`);
console.log(`  토큰 평균: 입력 ${Math.round(inAll / rows.length)}(그중 캐시 ${Math.round(hit / rows.length)}) · 출력 ${Math.round(rows.reduce((a, r) => a + r.output_tokens, 0) / rows.length)}`);
console.log(`  캐시 적중 ${((hit / inAll) * 100).toFixed(1)}%`);
console.log(`\n  **한 턴 평균 ${(합 / rows.length).toFixed(3)}원** · 중간값 ${중간.toFixed(3)}원`);
console.log(`  제일 싼 턴 ${값들[0].toFixed(3)}원 · 제일 비싼 턴 ${값들[값들.length - 1].toFixed(3)}원`);
console.log(`  ${날수}일 동안 모델값 모두 합쳐 ${합.toFixed(0)}원`);
console.log(`\n  못 세는 것: 서버·DB 고정비는 여기 없다. 진짜 숫자는 DeepSeek 청구서에 있다.`);
