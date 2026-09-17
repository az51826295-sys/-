/**
 * 기준 추리기의 자 (128회차 09-16). 돈 0, 모델 0, DB 0.
 *   npx tsx engine/tools/criteria_prune_probe.mts
 *
 * 고장 재현이 먼저다: **못 지킨 숙제가 '오래됐다'는 이유로 잘려 나가면** 퇴보를 못 본다.
 * 옛 방식(한 자루에 넣고 최근 것부터 자르기)이 그랬고, 새 방식이 그걸 막는지 본다.
 * 그리고 실제로 189개까지 불었던 판을 되살려 상한이 먹히는지 본다.
 */
import { pruneCriteria } from "../../src/lib/skills/appBuild/index";

type C = { id: string; when: string; then: string };
let bad = 0;
const check = (name: string, ok: boolean, got?: unknown) => { if (!ok) bad++; console.log(ok ? "통과" : "실패", name, ok ? "" : JSON.stringify(got)); };

const mk = (n: number, prefix = "c"): C[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, when: `조건 ${i}`, then: `결과 ${i}` }));

// ── 고장 재현: 오래된 '못 지킨 숙제' 하나가 최근 것들에 밀려 잘리는가
{
  const all = mk(100);
  const unmetOld = all[0]; // 가장 오래된 것이 아직 못 지킨 숙제다
  const coverage = [{ criterionId: unmetOld.id, met: false }, ...all.slice(1).map((c) => ({ criterionId: c.id, met: true }))];
  const out = pruneCriteria(all, coverage, "관계없는 주문");
  check("오래된 '못 지킨 숙제'가 살아남는다 (옛 방식은 여기서 잘렸다)", out.some((c) => c.id === unmetOld.id), out.map((c) => c.id).slice(0, 5));
  check(`상한 24 이하로 줄었다 (${out.length}개)`, out.length <= 24, out.length);
}

// ── 실제로 있었던 189개 판
{
  const all = mk(189);
  const out = pruneCriteria(all, [], "동전 색을 파랑으로 바꿔 줘");
  check(`189개 → ${out.length}개 (24 이하)`, out.length <= 24, out.length);
  check("원래 차례가 유지된다(읽기 좋게)", out.every((c, i) => i === 0 || Number(c.id.slice(1)) > Number(out[i - 1].id.slice(1))), out.map((c) => c.id));
}

// ── 주문과 관련된 것은 오래됐어도 남는다
{
  const all = [...mk(60), { id: "coin", when: "동전을 주우면", then: "점수가 오른다" }, ...mk(30, "d")];
  const out = pruneCriteria(all, [], "동전 색을 파랑으로");
  check("주문 낱말('동전')이 든 기준은 남는다", out.some((c) => c.id === "coin"), out.map((c) => c.id).slice(0, 6));
}

// ── 적으면 손대지 않는다
{
  const all = mk(20);
  const out = pruneCriteria(all, [], "아무 주문");
  check("상한 아래(20개)면 그대로 20개", out.length === 20, out.length);
}

// ── 못 지킨 것이 상한보다 많으면? 그래도 상한을 지키되 못 지킨 것만 남는다
{
  const all = mk(60);
  const coverage = all.map((c) => ({ criterionId: c.id, met: false }));
  const out = pruneCriteria(all, coverage, "관계없는 주문");
  check(`전부 못 지켰어도 상한 유지 (${out.length}개)`, out.length <= 24, out.length);
  check("남은 것이 전부 '못 지킨 것'", out.every((c) => coverage.find((v) => v.criterionId === c.id)?.met === false));
}

console.log(bad ? `\n실패 ${bad}` : "\n전부 통과");
process.exitCode = bad ? 1 : 0;
