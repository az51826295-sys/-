/**
 * **매일 쓰는 장부에서 안 움직이는 칸 찾기** (10-13). 모델 0 · 값 0.
 *   npx tsx engine/tools/장부_멈춘칸.mts --selftest          — 셈 규칙만(지어낸 장부, 이빨 확인)
 *   npx tsx engine/tools/rookery_env.mts engine/tools/장부_멈춘칸.mts [일수=21]
 *
 * **왜 만들었나.** 10-13 에 자가진화가 12일 동안 좁은 창에서 굶은 것을 찾았다. 증거는
 * 처음부터 장부에 있었다 — `genesis_runs.result` 의 `cases.total` 이 09-30 부터 10-13 까지
 * **열넷 모두 160** 이었다. 사례가 쌓이는 칸이 소수점 하나 없이 같은 값이면 그 자체가
 * 고장 신호인데, 나는 마지막 한 줄만 보고 있었다. **불평 하나에 자 하나** —
 * 눈으로 알아챈 것은 다음에 또 놓친다. 기계가 세게 한다.
 *
 * **무엇을 못 하나(정직하게).** "이 칸은 움직여야 한다" 를 자는 모른다. 한도·문턱처럼
 * 당연히 고정인 칸도 있다. 그래서 **판정하지 않고 늘어놓는다** — 며칠째 같은 값인지와
 * 그 값을. 고르는 것은 사람 몫이다. 대신 **흔들리는 칸은 올리지 않는다**(그게 이빨이다).
 *
 * **멈춘 칸의 까닭은 둘이고, 이 자는 못 가린다**:
 *   ① **창이 막혔다** — 재료는 늘었는데 코드가 안 본다. 10-13 `cases.total 160`(진짜 357)이 그랬다.
 *   ② **들어온 게 없다** — 재료 자체가 안 늘었다. 같은 날 `implicit 35/120` 은 이쪽이었다
 *      (1000줄 상한을 의심했는데 묶음이 821·175·46 으로 안 끊겼고, 업무가 7일째 0건이었다).
 * 가리는 법은 하나뿐이다 — **장부 밖에서 재료를 직접 세어 장부 숫자와 대 보는 것.**
 */
import { createClient } from "@supabase/supabase-js";

/** 중첩 기록을 `a.b.c` → 숫자로 펴 놓는다. 배열은 길이만 센다(줄 내용이 바뀌는 건 여기서 볼 게 아니다). */
export function 펴기(v: unknown, 앞 = "", 통: Record<string, number> = {}, 깊이 = 0): Record<string, number> {
  if (깊이 > 6) return 통;
  if (typeof v === "number" && Number.isFinite(v)) { 통[앞] = v; return 통; }
  if (Array.isArray(v)) { 통[`${앞}[]`] = v.length; return 통; }
  if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      // 회사 id 처럼 판마다 바뀌는 열쇠는 이름을 지워 같은 칸으로 모은다(안 그러면 하루짜리 칸만 쌓인다)
      const 이름 = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(k) ? "<회사>" : k;
      펴기(x, 앞 ? `${앞}.${이름}` : 이름, 통, 깊이 + 1);
    }
  }
  return 통;
}

export type 멈춘칸 = { 길: string; 값: number; 날수: number };

/**
 * **쌓여야 하는 칸** — 사는 날이 갈수록 커지는 것만 골라 적는다. 여기 있는 칸이 멈췄으면
 * 그건 "고정이 당연한 것" 이 아니라 **고장**이다. 이 목록은 내 판단이고, 그래서 글로 남긴다.
 * (10-13 실측: 아래 두 줄이 그날 찾은 고장 둘과 정확히 겹쳤다 — cases.total 160 · missingInUse 1)
 */
export const 쌓여야하는 = [
  /rules\.cases\.total$/,           // 자가진화가 보는 사례 수 — 날마다 는다
  /rules\.cases\.holdout(Bad)?$/,   // 검증용 사례 — 같이 는다
  /rules\.cases\.bySource\./,       // 출처별 사례 — 그 출처가 살아 있으면 는다
  /implicit\.(verdicts|withReply)$/,// 말에서 주운 반응 — 대화가 있으면 는다
  /vitals\.bySource\.human$/,       // 사람 판정 — 사장님이 누르면 는다
];
export const 쌓임만 = (xs: 멈춘칸[]) => xs.filter((x) => 쌓여야하는.some((p) => p.test(x.길)));

/** 날마다 하나씩 들어온 기록들에서, **적어도 `최소날` 일 나타났고 값이 한 번도 안 바뀐** 칸만 고른다. */
export function 멈춘칸찾기(판들: Record<string, unknown>[], 최소날 = 5): 멈춘칸[] {
  const 모음 = new Map<string, number[]>();
  for (const 판 of 판들) {
    for (const [길, 값] of Object.entries(펴기(판))) {
      const a = 모음.get(길) ?? []; a.push(값); 모음.set(길, a);
    }
  }
  const 답: 멈춘칸[] = [];
  for (const [길, 값들] of 모음) {
    if (값들.length < 최소날) continue;
    if (new Set(값들).size !== 1) continue;      // 한 번이라도 움직였으면 아니다
    답.push({ 길, 값: 값들[0], 날수: 값들.length });
  }
  return 답.sort((a, b) => b.날수 - a.날수 || a.길.localeCompare(b.길));
}

/* ── 셈 규칙만 재는 판 (DB 없이) ─────────────────────────────── */
if (process.argv.includes("--selftest")) {
  let 나쁨 = 0, 본 = 0;
  const 재기 = (n: string, ok: boolean, 본값?: unknown) => { 본++; if (!ok) 나쁨++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(본값)); };
  /* 지어낸 장부 일곱 판. `굳은.total` 은 쭉 160(진짜 고장 모양), `도는.쌓임` 은 매일 는다. */
  const 판들 = [0, 1, 2, 3, 4, 5, 6].map((i) => ({
    굳은: { total: 160, 문턱: 3 },
    도는: { 쌓임: 100 + i * 7 },
    한번만: { 어쩌다: 5 },
    줄: new Array(10 + i).fill(0),
    "5925c03a-557f-46d7-8589-7388b769df40": { 안: { 깊은칸: 42 } },
  }));
  const r = 멈춘칸찾기(판들 as never, 5);
  const 길들 = r.map((x) => x.길);
  재기("안 움직인 칸을 잡는다(굳은.total=160 · 7일)", r.some((x) => x.길 === "굳은.total" && x.값 === 160 && x.날수 === 7), r);
  재기("**흔들리는 칸은 안 올린다**(도는.쌓임) — 이빨", !길들.includes("도는.쌓임"), 길들);
  재기("배열은 길이로 본다(줄[] 은 매일 늘어 안 올라온다)", !길들.includes("줄[]"), 길들);
  재기("며칠 안 나온 칸은 판단하지 않는다(최소 날수)", 멈춘칸찾기(판들.slice(0, 3) as never, 5).length === 0);
  재기("회사 id 는 한 칸으로 모은다", 길들.includes("<회사>.안.깊은칸"), 길들);
  /* 심은 고장: 굳어 있던 칸을 하루만 움직여 본다 → 더는 '멈춘 칸' 이 아니어야 한다 */
  const 흔든 = JSON.parse(JSON.stringify(판들)); 흔든[3].굳은.total = 161;
  재기("고장 심기: 하루만 움직여도 멈춘 칸에서 빠진다", !멈춘칸찾기(흔든, 5).some((x: 멈춘칸) => x.길 === "굳은.total"));
  console.log(`\n본 줄 ${본} · 어긋남 ${나쁨}`);
  process.exit(나쁨 === 0 ? 0 : 1);
}

/* ── 진짜 장부 ─────────────────────────────────────────────── */
const 일수 = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 21);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const { data, error } = await db.from("genesis_runs").select("run_date, kind, status, result")
  .eq("kind", "daily").order("run_date", { ascending: false }).limit(일수);
if (error) { console.error("genesis_runs 못 읽음:", error.message); process.exit(1); }

const 판들 = (data ?? []).filter((r) => r.result).map((r) => r.result as Record<string, unknown>);
console.log(`\n자가진화 매일 장부 — 최근 ${판들.length}판 (${(data ?? []).at(-1)?.run_date} ~ ${(data ?? [])[0]?.run_date})\n`);
if (판들.length < 5) { console.log("  판이 5개가 안 된다 — **판단하지 않는다.**"); process.exit(0); }

const 멈춘 = 멈춘칸찾기(판들, Math.min(5, 판들.length));

/* 아침보고가 부르는 모양 — **쌓여야 하는데 멈춘 칸만** 한 줄로 */
if (process.argv.includes("--쌓임만")) {
  const 것 = 쌓임만(멈춘);
  console.log(것.length
    ? `쌓여야 하는데 ${판들.length}판 내내 멈춘 칸 ${것.length}개: ${것.map((x) => `${x.길.split(".").slice(-2).join(".")}=${x.값}`).join(" · ")}`
    : `쌓여야 하는 칸은 전부 움직인다(${판들.length}판)`);
  process.exit(0);
}

if (!멈춘.length) console.log("  매일 쓰이면서 한 번도 안 움직인 숫자 칸: 없다");
else {
  console.log(`  **${판들.length}판 내내 같은 값인 숫자 칸 ${멈춘.length}개** — 고정이 당연한 것도 섞여 있다(판정하지 않는다):`);
  for (const x of 멈춘) console.log(`    ${x.길.padEnd(42)} ${String(x.값).padStart(8)}   (${x.날수}판)`);
  console.log(`\n  읽는 법: **쌓여야 하는 칸**(사례 수·후보 수·고친 줄 수)이 여기 있으면 그건 고장이다.`);
  console.log(`  10-13 에 \`<회사>.rules.cases.total\` 이 14판 내내 160 이었고, 그게 자가진화가 12일 굶은 자리였다.`);
}
