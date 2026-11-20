import { z } from "zod";
import type { AIProvider } from "@/lib/providers/types";

/**
 * **판단 엔진 — 로키에서 떼어 낸 것** (11-20 사장님 "로키 엔진 팔 수 있는 걸로 · AI 를 다루는 판단 엔진으로써").
 *
 * 로키의 머리(`src/lib/genesis/head.ts`)는 **로키 안에서만 말이 됐다**: 고를 수 있는 AI 가 로키가 정한 일곱 개,
 * 근거가 사장님 회사 장부(DB), 지시문에 "사장님 · 어제 광고 세 판" 같은 로키 사정이 박혀 있었다.
 * 남이 쓰려면 **손님의 AI 목록 · 손님의 장부**만 받아서 판단해야 한다. 여기가 그 자리다. DB 를 모른다.
 *
 * ## 팔 물건이 다른 도구와 다른 한 줄
 *
 * 계획은 다른 도구들도 세운다. 이 엔진은 **판단마다 "통과할 확률" 을 먼저 적어 잠그고**,
 * 결과가 오면 그 예측을 채점한다(`scorecard`). "지난번 내 판단이 틀렸다" 를 숫자로 들고 다니는 판단자.
 * 로키에서 쓰던 같은 생각([[rulers-as-predictors]], 계기판 [[genesis-vitals]])을 손님 쪽으로 옮긴 것이다.
 *
 * ## 지킨 것
 *
 * - **사실은 기계가 센다.** 장부를 세는 일(`ledgerFacts`)에 모델이 없다 — 판수·통과·값·시간·예측 오차.
 *   판단자는 그 위에서 고른다. 세는 쪽이 지어내면 판단을 의심할 근거가 사라진다.
 * - **판이 적으면 적다고 적는다.** 3판짜리 100% 를 30판짜리 80% 와 같은 줄에 세우지 않는다
 *   ([[model-choice-table]] — 쉬운 일을 싼 자리에 보내 생긴 88% 가 착시였다).
 * - **난간은 문이 아니다.** 없는 자리를 고르면 첫 자리로 돌리고 그 사실을 적는다. 막지 않는다.
 * - 이름이 ASCII 인 까닭: `.mts` 자가 이 모듈을 부른다(tsx 가 한글 export 를 흘린다).
 */

/** 손님이 가진 AI 하나. `id` 가 그 손님 쪽에서 부르는 이름이다. */
export type Seat = {
  id: string;
  /** 출력 백만 토큰당 달러(모르면 비운다 — 판단자가 "값 모름" 으로 본다). */
  outPerMTok?: number;
  /** 그림을 보나. */
  sees?: boolean;
  /** 손님이 적은 한 줄(잘하는 것 · 버릇). 판단자가 읽는다. */
  note?: string;
};

/** 장부 한 줄 — 판단 하나와 그 결과. 결과가 아직이면 `passed` 가 없다. */
export type LedgerEntry = {
  at: string;
  task: string;
  /** 일의 종류(손님이 정하는 낱말 — "게임", "고침", "문서"…). 같은 종류끼리 성적을 센다. */
  kind: string;
  seat: string;
  effort: Effort;
  /** 판단할 때 **먼저 적어 잠근** 통과 확률. */
  predictedPass: number;
  passed?: boolean;
  /** 통과한 확인 수 / 전체(부분 점수). */
  score?: { met: number; total: number };
  usd?: number;
  sec?: number;
};

export const EFFORTS = ["가볍게", "보통", "꼼꼼히"] as const;
export type Effort = (typeof EFFORTS)[number];

export type Decision = {
  seat: string;
  effort: Effort;
  /** 0~1. **결과를 보기 전에 잠근다.** 이게 채점 대상이다. */
  predictedPass: number;
  estimate: string;
  why: string;
  risk: string;
  /** 판단 한 번에 든 값(판단자 호출). 공짜 판단은 없다 — 손님 지갑에서 같이 나간다. */
  usd: number;
  /** 난간이 손댔으면 무엇을. */
  guard?: string;
};

/* ────────────────────────────── 세기 (모델 0) ────────────────────────────── */

type Tally = { n: number; pass: number; usd: number; sec: number; brier: number; scored: number };
const empty = (): Tally => ({ n: 0, pass: 0, usd: 0, sec: 0, brier: 0, scored: 0 });

/** 자리별 · (자리×종류)별 성적. 결과가 안 온 줄은 세지 않는다. */
export function tally(ledger: LedgerEntry[]) {
  const bySeat = new Map<string, Tally>();
  const bySeatKind = new Map<string, Tally>();
  for (const e of ledger) {
    if (e.passed === undefined) continue;
    for (const [m, k] of [[bySeat, e.seat], [bySeatKind, `${e.seat}·${e.kind}`]] as const) {
      const t = m.get(k) ?? empty();
      t.n++; if (e.passed) t.pass++;
      t.usd += e.usd ?? 0; t.sec += e.sec ?? 0;
      t.brier += (e.predictedPass - (e.passed ? 1 : 0)) ** 2; t.scored++;
      m.set(k, t);
    }
  }
  return { bySeat, bySeatKind };
}

/**
 * **판단자가 보는 사실** — 의견 0. 판이 적은 칸에는 "판이 적다" 를 붙인다.
 * 장부가 비었으면 **비었다고** 적는다(첫날 손님). 그때 판단은 자리 설명만으로 한다.
 */
export function ledgerFacts(seats: Seat[], ledger: LedgerEntry[], kind: string): string {
  const { bySeat, bySeatKind } = tally(ledger);
  const rows: string[] = ["### 쓸 수 있는 AI"];
  for (const s of seats) {
    const t = bySeat.get(s.id), tk = bySeatKind.get(`${s.id}·${kind}`);
    const 값 = s.outPerMTok != null ? `출력 $${s.outPerMTok}/백만토큰` : "값 모름";
    const 성적 = (x: Tally | undefined, 이름: string) =>
      !x ? `${이름} 기록 없음` : `${이름} ${x.pass}/${x.n} 통과 · 판당 $${(x.usd / x.n).toFixed(3)} · ${Math.round(x.sec / x.n)}초${x.n < 5 ? " (판이 적다 — 믿을 게 못 된다)" : ""}`;
    rows.push(`- ${s.id}: ${값}${s.sees ? " · 그림을 본다" : ""}${s.note ? ` · ${s.note}` : ""}\n  ${성적(t, "전체")} / ${성적(tk, `"${kind}"`)}`);
  }
  const 끝난 = ledger.filter((e) => e.passed !== undefined);
  if (!끝난.length) rows.push("\n### 장부\n- **비어 있다.** 이 손님의 판단 기록이 아직 없다 — 자리 설명만으로 고른다.");
  else {
    const b = 끝난.reduce((a, e) => a + (e.predictedPass - (e.passed ? 1 : 0)) ** 2, 0) / 끝난.length;
    rows.push(`\n### 지난 판단의 채점\n- 끝난 판 ${끝난.length} · 예측 오차(Brier) ${b.toFixed(3)} — 0 이 완벽, 0.25 가 동전 던지기`);
    const 최근 = 끝난.slice(-5).map((e) => `  · ${e.kind} → ${e.seat}/${e.effort}: 예측 ${Math.round(e.predictedPass * 100)}% · 결과 ${e.passed ? "통과" : "실패"}${e.score ? ` (${e.score.met}/${e.score.total})` : ""}`);
    rows.push("- 최근:\n" + 최근.join("\n"));
  }
  return rows.join("\n");
}

/** 성적표 — 손님에게 보여 주는 것. 판단이 나아지고 있나. */
export function scorecard(ledger: LedgerEntry[]) {
  const 끝난 = ledger.filter((e) => e.passed !== undefined);
  const brier = 끝난.length ? 끝난.reduce((a, e) => a + (e.predictedPass - (e.passed ? 1 : 0)) ** 2, 0) / 끝난.length : null;
  const 반 = Math.floor(끝난.length / 2);
  const 앞 = 끝난.slice(0, 반), 뒤 = 끝난.slice(반);
  const b = (xs: LedgerEntry[]) => (xs.length ? xs.reduce((a, e) => a + (e.predictedPass - (e.passed ? 1 : 0)) ** 2, 0) / xs.length : null);
  return {
    판: 끝난.length,
    통과: 끝난.filter((e) => e.passed).length,
    달러: 끝난.reduce((a, e) => a + (e.usd ?? 0), 0),
    brier,
    /** 앞 절반 대 뒤 절반 — 쌓일수록 예측이 맞아 가나. 판이 적으면 null. */
    나아지나: 끝난.length >= 6 ? { 앞: b(앞), 뒤: b(뒤) } : null,
  };
}

/* ────────────────────────────── 판단 (모델 1회) ────────────────────────────── */

const schema = z.object({
  seat: z.string().describe("맡길 AI 의 id. 목록에 있는 것 그대로."),
  effort: z.enum(EFFORTS).describe("만든 뒤 돌려 보고 고치기를 몇 바퀴: 가볍게=1 · 보통=3 · 꼼꼼히=8. 바퀴마다 값과 시간이 든다."),
  predictedPass: z.number().describe("이 선택으로 **모든 확인을 통과할** 확률 0~1. 결과를 보기 전에 잠근다 — 나중에 채점된다. 겸손하게, 그러나 0.5 로 도망가지 마라."),
  estimate: z.string().describe("값과 시간의 감. 예: '약 $0.04 · 2분'. 장부 판당 값을 근거로. 기록이 없으면 그렇다고."),
  why: z.string().describe("근거 두어 줄. 장부 숫자를 댄다. 판이 적은 숫자를 믿지 마라."),
  risk: z.string().describe("틀린다면 어디서."),
});

const SYS = [
  "너는 **AI 여러 개를 쓰는 사람의 판단자**다. 일 하나가 들어오면 어느 AI 에, 얼마나 공들여 맡길지 정한다.",
  "아래 사실은 전부 기계가 이 사람의 장부에서 센 것이다. 지어내지 마라.",
  "",
  "- 목표는 **확인을 통과하는 결과를, 덜 쓰고** 얻는 것이다. 비싼 AI 는 그만한 이유가 있을 때만.",
  "- 판이 적은 성적(5판 미만)은 믿을 게 못 된다. 쉬운 일만 맡은 자리의 높은 통과율은 착시일 수 있다.",
  "- `predictedPass` 는 채점된다. 지난 채점(Brier)이 나쁘면 네 확신을 줄여라.",
  "- 장부가 비었으면 자리 설명과 값만으로 고르고, 그 사실을 why 에 적어라.",
].join("\n");

/**
 * 한 번 정한다. 실패해도 던지지 않는다 — 첫 자리 · 보통 · 0.5 로 간다(문이 아니다). 그 사실을 `guard` 에 적는다.
 * `meter` 는 판단자 호출 값을 돌려받는 자리다(손님 지갑에서 같이 나간다).
 */
export async function decideFor(
  brain: AIProvider,
  input: { task: string; kind: string; seats: Seat[]; ledger: LedgerEntry[] },
  meter: (usage: { model: string; inputTokens: number; outputTokens: number }) => number = () => 0,
): Promise<Decision> {
  const ids = input.seats.map((s) => s.id);
  try {
    const r = await brain.generateStructuredOutput({
      systemInstructions: SYS,
      input: ["## 사실", ledgerFacts(input.seats, input.ledger, input.kind), "", "## 이 일", `종류: ${input.kind}`, `주문: ${input.task.slice(0, 2000)}`].join("\n"),
      schema, schemaName: "director_decision", maxTokens: 16000, tier: "judgment",
    });
    const usd = meter({ model: r.model, inputTokens: r.inputTokens ?? 0, outputTokens: r.outputTokens ?? 0 });
    const o = r.output;
    const 맞는자리 = ids.includes(o.seat);
    return {
      seat: 맞는자리 ? o.seat : ids[0],
      effort: o.effort,
      predictedPass: Math.min(1, Math.max(0, Number(o.predictedPass) || 0)),
      estimate: o.estimate, why: o.why, risk: o.risk, usd,
      ...(맞는자리 ? {} : { guard: `없는 자리 "${o.seat}" 를 골라 ${ids[0]} 로 돌렸다` }),
    };
  } catch (e) {
    return { seat: ids[0], effort: "보통", predictedPass: 0.5, estimate: "모르겠다", why: "", risk: "", usd: 0,
      guard: `판단자가 정하지 못했다(${e instanceof Error ? e.message.slice(0, 80) : e}) — 첫 자리로 간다` };
  }
}

/** effort → 고치기 바퀴 수. 로키의 `roundsFor` 와 같은 숫자(가볍게 1 · 보통 3 · 꼼꼼히 8). */
export const roundsOf = (e: Effort): number => (e === "가볍게" ? 1 : e === "꼼꼼히" ? 8 : 3);
