/**
 * **어느 자리가 상한에 물리고 있나** — 장부에서 센다 (226회차 2026-09-27).
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/truncation_look.mts [며칠]
 *
 * 09-27 에 심판 예측자가 **900 토큰**에 갇혀 Brier 0.369 였다(열어 주니 0.299).
 * 그러고 코드를 훑으니 판단 자리인데 16000 아래인 곳이 넷 더 있었다 —
 * `seatBench` 2000 · `askJudge` 6000 · `head` 6000 · `judge` 8000.
 *
 * **한꺼번에 올리지 않는다**([[rule-blast-radius]]). 대신 **이미 산 기록**으로 어느 것이 실제로
 * 물고 있는지 센다. `model_exchanges` 에 호출마다 `ok`·`error_kind` 가 남는다 — 호출 0번, 값 0원.
 *
 * 잘림은 조용하지 않다: 잘리면 라우터가 **더 비싼 자리로 올린다.** 그래서 기록에는
 * "떨어진 호출" 과 "그 뒤에 비싼 모델이 답한 줄" 이 같이 남는다. 둘을 같이 본다.
 */
import { createServiceClient } from "../../src/lib/supabase/service";

const 며칠 = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 14);
const 부터 = new Date(Date.now() - 며칠 * 86400_000).toISOString();
const db = createServiceClient();

type Row = { purpose: string | null; tier: string | null; model: string | null; ok: boolean; error_kind: string | null };

// 첫 판에 `limit(20000)` 을 줬는데 **정확히 1000줄**이 왔다 — 서버가 한 번에 주는 최대치다.
// 실제로는 1222줄이었으니 **82% 만 보고 결론을 적은 것**이다. 그래서 전체 수를 따로 세고,
// 줄은 쪽을 넘겨 가며 다 읽는다. 받은 수가 전체와 다르면 그것도 적는다.
const { count: 전체 } = await db
  .from("model_exchanges")
  .select("*", { count: "exact", head: true })
  .gte("created_at", 부터);

const rows: Row[] = [];
for (let 시작 = 0; ; 시작 += 1000) {
  const { data, error } = await db
    .from("model_exchanges")
    .select("purpose,tier,model,ok,error_kind")
    .gte("created_at", 부터)
    .order("created_at", { ascending: false })
    .range(시작, 시작 + 999);
  if (error) {
    console.error("장부를 못 읽었다:", error.message);
    process.exit(1);
  }
  const 쪽 = (data ?? []) as Row[];
  rows.push(...쪽);
  if (쪽.length < 1000) break;
}
console.log(`지난 ${며칠}일 · 호출 ${rows.length.toLocaleString()}줄 (장부가 센 전체 ${(전체 ?? 0).toLocaleString()}줄)`);
if (전체 != null && rows.length !== 전체) console.log(`  ! 받은 수와 전체가 다르다 — 결론을 적기 전에 이 줄을 먼저 본다.`);
console.log();

type Agg = { 전부: number; 떨어짐: number; 잘림: number; 모델: Map<string, number>; 등급: Set<string> };
const per = new Map<string, Agg>();
for (const r of rows) {
  const k = r.purpose ?? "(이름 없음)";
  const a = per.get(k) ?? { 전부: 0, 떨어짐: 0, 잘림: 0, 모델: new Map(), 등급: new Set() };
  a.전부++;
  if (!r.ok) a.떨어짐++;
  if (/trunc/i.test(r.error_kind ?? "")) a.잘림++;
  if (r.model) a.모델.set(r.model, (a.모델.get(r.model) ?? 0) + 1);
  if (r.tier) a.등급.add(r.tier);
  per.set(k, a);
}

// 잘린 비율이 높은 것부터. 잘림이 0 이어도 떨어짐이 많으면 같이 보여 준다.
const 줄 = [...per.entries()]
  .filter(([, a]) => a.전부 >= 3)
  .sort((x, y) => y[1].잘림 / y[1].전부 - x[1].잘림 / x[1].전부 || y[1].전부 - x[1].전부);

console.log("자리                    호출   떨어짐   **잘림**   등급          모델(많은 것부터)");
for (const [k, a] of 줄) {
  const 모델 = [...a.모델.entries()].sort((p, q) => q[1] - p[1]).map(([m, n]) => `${m}×${n}`).join(" ");
  const 잘림표 = a.잘림 ? `**${a.잘림}** (${((a.잘림 * 100) / a.전부).toFixed(0)}%)` : "0";
  console.log(
    `${k.padEnd(22).slice(0, 22)} ${String(a.전부).padStart(5)} ${String(a.떨어짐).padStart(6)}   ${잘림표.padEnd(10)} ` +
      `${[...a.등급].join(",").padEnd(12)} ${모델.slice(0, 60)}`,
  );
}

const 잘린곳 = 줄.filter(([, a]) => a.잘림 > 0);
const 뭉뚱 = rows.filter((r) => !r.ok && (r.error_kind === "other" || r.error_kind === null)).length;

console.log(
  잘린곳.length
    ? `\n**잘리고 있는 자리 ${잘린곳.length}개.** 여기는 상한을 올릴 근거가 장부에 있다 — 그 자리의 maxTokens 를 본다.`
    : "\n잘림으로 적힌 것 0건.",
);
if (!잘린곳.length && 뭉뚱 > 0) {
  console.log(
    `  다만 **'other'·빈칸으로 뭉뚱그려진 실패가 ${뭉뚱}건** 있다. 09-27 까지 \`errorKind\` 에\n` +
      "  **잘림 분기가 아예 없어서** 잘림이 전부 'other' 로 들어갔다. 그 날 이전 기록에서는\n" +
      "  0 이 \"없다\" 가 아니라 **\"모른다\"** 다. 분기를 넣었으니 앞으로 쌓이는 것부터 셀 수 있다.",
  );
}
console.log("호출 0번 · 값 0원. 이미 산 기록을 읽은 것뿐이다.");
