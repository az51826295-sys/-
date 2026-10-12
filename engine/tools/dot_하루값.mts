/**
 * **두근도트가 하루에 얼마 쓰나** (10-12). 모델 0 · 값 0.
 *   npx tsx engine/tools/dot_하루값.mts [일수=14]
 *
 * 사장님 "그 돈 아예 안 들게도 만들 수 있지?" — **먼저 얼마인지부터** 알아야 한다.
 * 하루 $0.01 이면 푸는 게 문제가 아니고, $5 면 다른 이야기다.
 *
 * 두근도트는 **값을 적는 자리가 없다**(로키와 달리 model_usage 를 안 쓴다).
 * 그래서 **턴 수를 세고 턴당 값을 곱해** 어림한다. 어림인 것을 숨기지 않는다 —
 * 진짜 숫자는 DeepSeek 청구서에만 있고 그건 사장님 손에 있다.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const 일수 = Number(process.argv[2] ?? 14);
const 어제 = (n: number) => new Date(Date.now() - n * 864e5).toISOString();

/** 쪽으로 나눠 받는다 — 한 번에 1000줄 상한이 있다(10-12 에 로키에서 걸렸다) */
async function 전부(표: string, 칸: string, 언제: string) {
  const 들: any[] = [];
  for (let 쪽 = 0; ; 쪽++) {
    const { data, error } = await db.from(표).select(칸).gte("created_at", 언제)
      .order("created_at", { ascending: true }).range(쪽 * 1000, 쪽 * 1000 + 999);
    if (error) { console.error(`${표} 못 읽음: ${error.message}`); return null; }
    들.push(...(data ?? []));
    if (!data || data.length < 1000) return 들;
    if (쪽 > 50) return 들;
  }
}

const 말 = await 전부("dot_messages", "role,created_at,user_id", 어제(일수));
if (!말) process.exit(1);

/* **모델을 부른 횟수 = 캐릭터가 답한 횟수**다. 사람이 친 줄은 모델을 안 부른다. */
const 답 = 말.filter((m: any) => m.role !== "user");
const 사람 = 말.filter((m: any) => m.role === "user");
const 날별 = new Map<string, number>();
for (const m of 답) {
  const d = new Date(new Date(m.created_at).getTime() + 9 * 3600e3).toISOString().slice(0, 10);
  날별.set(d, (날별.get(d) ?? 0) + 1);
}
const 사람수 = new Set(말.map((m: any) => m.user_id)).size;

console.log(`최근 ${일수}일 — 두근도트\n`);
console.log(`  사람이 친 줄 ${사람.length} · **캐릭터가 답한 줄 ${답.length}**(= 모델 호출) · 쓴 사람 ${사람수}명\n`);
console.log("  날마다 답한 줄(한국 날짜):");
for (const [d, n] of [...날별].sort()) console.log(`    ${d}  ${String(n).padStart(5)}`);

/* **턴당 값 어림.** DeepSeek v3 기준 입력 $0.14/M · 출력 $0.28/M (공개 단가, 10-12 기준).
   한 턴에 지난 대화를 같이 보내므로 입력이 크다 — 코드의 HISTORY_TURNS 와 maxTokens 로 어림한다.
   **이건 어림이다.** 진짜 숫자는 청구서에만 있다. */
const 입력토큰 = 2000, 출력토큰 = 300;
const 턴값 = (입력토큰 / 1e6) * 0.14 + (출력토큰 / 1e6) * 0.28;
const 하루평균 = 답.length / 일수;
console.log(`\n  턴 하나 어림: 입력 ${입력토큰} · 출력 ${출력토큰} 토큰 → **$${턴값.toFixed(5)}**`);
console.log(`  하루 평균 ${하루평균.toFixed(1)}턴 → 하루 **$${(하루평균 * 턴값).toFixed(3)}** · 한 달 **$${(하루평균 * 턴값 * 30).toFixed(2)}**`);
console.log(`\n  ※ 어림이다. 두근도트는 값을 적는 자리가 없다(model_usage 를 안 쓴다).`);
console.log(`     진짜 숫자는 DeepSeek 청구서에 있고 그건 사장님 손이다.`);
