/**
 * **기획안의 숫자를 덤프로 다시 센다** (10-28). 모델 0 · 값 0.
 *   npx tsx engine/tools/dot_numbers.mts
 *
 * 사장님이 가져온 마스터플랜은 1번(데이터 진단) 위에 전부 서 있다.
 * 그 숫자가 틀리면 수익화·리텐션 설계가 통째로 어긋난다 — 그래서 코드가 센다.
 * 본문은 안 읽는다. 세는 데 필요한 **개수·날짜·역할**만 본다.
 */
import { readFileSync } from "node:fs";

const d = JSON.parse(readFileSync("C:/Users/az518/Desktop/ai-workforce/engine/work/dot-이사/dot-dump.json", "utf8")) as
  Record<string, Record<string, unknown>[]>;

const 날 = (s: unknown) => String(s ?? "").slice(0, 10);
const 사람 = d.auth_users ?? [];
const 말 = d.dot_messages ?? [];
const 턴 = d.dot_turns ?? [];
const 결제 = d.dot_purchases ?? [];
const 친밀 = d.dot_bonds ?? [];

/* ── 기간 ── */
const 날들 = 말.map((m) => 날(m.created_at)).filter(Boolean).sort();
const 첫날 = 날들[0], 끝날 = 날들[날들.length - 1];
const 일수 = 첫날 && 끝날 ? Math.round((+new Date(끝날) - +new Date(첫날)) / 86400000) + 1 : 0;

console.log(`기간 ${첫날} ~ ${끝날} (${일수}일)`);
console.log(`가입 ${사람.length}명 · 말 ${말.length}줄 · 턴 ${턴.length} · 결제 ${결제.length} · 친밀도 ${친밀.length}`);

/* ── 실제로 말한 사람만 ── */
const 사람별: Record<string, string[]> = {};
for (const m of 말) {
  const u = String(m.user_id ?? "");
  if (!u) continue;
  (사람별[u] ??= []).push(날(m.created_at));
}
const 말한사람 = Object.keys(사람별);
console.log(`\n한 번이라도 말한 사람: ${말한사람.length}명 (가입 ${사람.length}명 중)`);

/* ── 하루 대화 수: **유저 말만** 센다(AI 답을 같이 세면 두 배가 된다) ── */
const 역할 = new Set(말.map((m) => String(m.role ?? "")));
const 유저말 = 말.filter((m) => String(m.role) === "user");
console.log(`role 칸의 값: ${[...역할].join(", ")} · 그중 user ${유저말.length}줄`);

const 사람일별: Record<string, Record<string, number>> = {};
for (const m of 유저말) {
  const u = String(m.user_id ?? ""); if (!u) continue;
  ((사람일별[u] ??= {})[날(m.created_at)] ??= 0);
  사람일별[u][날(m.created_at)]++;
}
const 하루치 = Object.values(사람일별).flatMap((v) => Object.values(v)).sort((a, b) => a - b);
const 중앙 = 하루치.length ? 하루치[Math.floor(하루치.length / 2)] : 0;
const 평균 = 하루치.length ? 하루치.reduce((a, b) => a + b, 0) / 하루치.length : 0;
console.log(`\n**말한 날 하루 대화**: 평균 ${평균.toFixed(1)}회 · 중앙값 ${중앙}회 (활동일 ${하루치.length}개)`);
console.log(`   30회 넘은 날: ${하루치.filter((x) => x >= 30).length}개 (${((하루치.filter((x) => x >= 30).length / (하루치.length || 1)) * 100).toFixed(1)}%)`);
console.log(`   10회 넘은 날: ${하루치.filter((x) => x >= 10).length}개 · 5회 넘은 날: ${하루치.filter((x) => x >= 5).length}개`);

/* ── 하루 만에 떠난 사람 ── */
const 하루만 = 말한사람.filter((u) => new Set(사람별[u]).size === 1);
console.log(`\n**하루만 쓰고 안 온 사람**: ${하루만.length}/${말한사람.length} (${((하루만.length / (말한사람.length || 1)) * 100).toFixed(0)}%)`);

/* ── 친밀도가 어디서 멈추나 ── */
const 단계: Record<string, number> = {};
for (const b of 친밀) 단계[String(b.stage ?? "?")] = (단계[String(b.stage ?? "?")] ?? 0) + 1;
console.log(`\n친밀도 단계별: ${Object.entries(단계).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, v]) => `${k}단계 ${v}명`).join(" · ")}`);

/* ── 결제는 정말 0인가 ── */
console.log(`\n**결제 ${결제.length}건** ${결제.length ? "— 기획안의 '0건' 과 다르다" : ""}`);
for (const p of 결제) console.log(`   ${날(p.created_at)} · ${String(p.sku ?? p.product_id ?? "?")} · ${String(p.status ?? "")}`);
