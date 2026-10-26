/**
 * **못 잼을 어긋남으로도, 맞음으로도 적지 않나** (10-26). 모델 0 · 값 0 · DB 0.
 *   npx tsx engine/work/probe/verdict-fold-test.mts [--sabotage]
 *
 * 둘 다 틀리기 쉽다:
 *   · 못 잼을 **어긋남**으로 두면 만족 불가 조건으로 멀쩡한 걸 고치러 들어간다(지금 고치는 병)
 *   · 못 잼을 **맞음**으로 올리면 열린 채 고장이 된다 — 이쪽이 더 나쁘다
 */
import { foldVerdict, type RawVerdict } from "../../../src/lib/hand/verdictFold";

const 심기 = process.argv.includes("--sabotage");
let 나쁨 = 0;
const 재기 = (n: string, ok: boolean, 본?: unknown) => {
  if (!ok) 나쁨++;
  console.log((ok ? "통과" : "실패") + " " + n + (본 === undefined ? "" : "  " + JSON.stringify(본)));
};

/* 심은 판: 못 잼을 맞음으로 올려 버리는 접기. 자가 멀쩡하면 떨어져야 한다. */
const 접기 = 심기
  ? (v: RawVerdict) => ({ ...v, verdict: "PASS", fail: [], undefined: [] })
  : foldVerdict;

const 바닥만 = (): RawVerdict => ({
  verdict: "FAIL",
  fail: ["바닥 대비 11.3 < 60 (참고 99) — 땅에 묻힌다"],
  undefined: [], colors: 18, saturation: 62,
});

/* ── ① 스프라이트: 바닥 줄은 못 잼으로 ── */
const a = 접기(바닥만(), "sprite", 1);
재기("스프라이트면 바닥 줄이 어긋남에서 빠진다", (a.fail ?? []).length === 0, { fail: a.fail });
재기("판정이 못 잼이다 (맞음이 아니다)", a.verdict === "UNDEFINED", { verdict: a.verdict });
재기("무엇을 더 내면 되는지 적는다",
  (a.undefined ?? []).some((s) => s.includes("in_context")), { undefined: a.undefined });

/* ── ② 배경 위 장면이면 바닥 줄은 그대로 어긋남 ── */
if (!심기) {
  const b = foldVerdict(바닥만(), "in_context", 1);
  재기("장면이면 바닥 줄은 어긋남으로 남는다", b.verdict === "FAIL" && (b.fail ?? []).length === 1, { verdict: b.verdict, fail: b.fail });
}

/* ── ③ 다른 어긋남이 같이 있으면 어긋남이다 — 바닥만 빼고 통과시키면 안 된다 ── */
const c = 접기({ verdict: "FAIL", fail: ["색 10 < 16 — 실루엣에 가깝다", "바닥 대비 11.3 < 60"], undefined: [] }, "sprite", 1);
재기("색이 모자라면 여전히 어긋남", c.verdict === "FAIL", { verdict: c.verdict, fail: c.fail });

/* ── ④ 한 장이면 세트 값은 못 잼 ── */
const d = 접기({ verdict: "FAIL", fail: ["color_spread 0.8 > 0.5"], undefined: [] }, "in_context", 1);
재기("한 장이면 세트 값은 못 잼", d.verdict === "UNDEFINED", { verdict: d.verdict });
if (!심기) {
  const e = foldVerdict({ verdict: "FAIL", fail: ["color_spread 0.8 > 0.5"], undefined: [] }, "in_context", 4);
  재기("여러 장이면 세트 값은 어긋남으로 남는다", e.verdict === "FAIL", { verdict: e.verdict });
}

/* ── ⑤ 아무 문제 없으면 맞음 ── */
const f = 접기({ verdict: "PASS", fail: [], undefined: [] }, "sprite", 1);
재기("깨끗하면 맞음", f.verdict === "PASS", { verdict: f.verdict });

/* ── ⑥ 원래 못 잼은 그대로 남는다 ── */
const g = 접기({ verdict: "UNDEFINED", fail: [], undefined: ["얼굴을 못 찾았다"] }, "sprite", 1);
재기("원래 못 잼은 안 사라진다", (g.undefined ?? []).includes("얼굴을 못 찾았다"), { undefined: g.undefined });

/* ── ⑦ 잰 숫자는 그대로 실려 간다 — 없으면 고칠 데가 안 보인다 ── */
재기("잰 숫자가 남아 있다", a.colors === 18 && a.saturation === 62, { colors: a.colors, saturation: a.saturation });

if (심기) {
  console.log(나쁨 ? `\n심은 판에서 ${나쁨}개 잡았다 — 자가 산다` : "\n**심었는데 다 통과했다 — 자가 눈멀었다**");
  process.exit(나쁨 ? 0 : 1);
}
console.log(나쁨 ? `\n**${나쁨}개 실패**` : "\n전부 통과");
process.exit(나쁨 ? 1 : 0);
