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
  /** 누가 정했나 — 장부가 답했나(값 0), 판단자를 불렀나. */
  via?: Via;
  /** 그 판단 한 번에 든 값. 일 값(`usd`)과 따로 센다 — 판단이 일보다 비싸면 판 물건이 아니다. */
  judgeUsd?: number;
};

export type Via = "장부" | "판단자" | "난간" | "탐색" | "올림";

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
  via: Via;
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

/**
 * 성적표 — 손님에게 보여 주는 것. 판단이 나아지고 있나 · 판단에 얼마 들었나 · 얼마 아꼈나.
 *
 * `baseline` = 엔진이 없을 때 손님이 늘 쓰던 AI. 아낀 돈은 **어림**이다 — 같은 일을 그 AI 로 돌렸다면
 * 출력 단가 비율만큼 들었으리라고 본다(토큰 수가 같다는 가정). 실제로 돌려 본 값이 아니므로 이름에 "어림" 을 단다.
 */
export function scorecard(ledger: LedgerEntry[], opts: { seats?: Seat[]; baseline?: string } = {}) {
  const 끝난 = ledger.filter((e) => e.passed !== undefined);
  const 단가 = new Map((opts.seats ?? []).map((s) => [s.id, s.outPerMTok]));
  const 기준단가 = opts.baseline ? 단가.get(opts.baseline) : undefined;
  let 아낀어림: number | null = null;
  if (기준단가 != null) {
    아낀어림 = 0;
    for (const e of 끝난) {
      const 내단가 = 단가.get(e.seat);
      if (내단가 == null || !내단가 || e.usd == null) continue;
      아낀어림 += e.usd * (기준단가 / 내단가) - e.usd;
    }
  }
  /*
   * **늘 같은 확률을 찍는 판단자보다 나은가** (11-21). Brier 만 보면 다 통과하는 장부에서 "늘 통과" 라고
   * 찍는 바보가 제일 잘한다 — 11-20 성적표 0.041 이 실력처럼 보였던 까닭. 장부의 통과율 하나를 늘 찍는
   * 판단자의 Brier 와 견줘 **실력 = 1 − 내 Brier ÷ 바보 Brier** 를 낸다. 실패가 없으면 바보가 완벽해서
   * 견줄 수 없다 — 그때는 null(못 잼)이지 0 이 아니다([[zero-can-mean-i-cannot-see]]).
   */
  const 통과율 = 끝난.length ? 끝난.filter((e) => e.passed).length / 끝난.length : null;
  const 바보brier = 통과율 == null ? null : 끝난.reduce((a, e) => a + (통과율 - (e.passed ? 1 : 0)) ** 2, 0) / 끝난.length;
  const 판단값 = 끝난.reduce((a, e) => a + (e.judgeUsd ?? 0), 0);
  const 일값 = 끝난.reduce((a, e) => a + (e.usd ?? 0), 0);
  const brier = 끝난.length ? 끝난.reduce((a, e) => a + (e.predictedPass - (e.passed ? 1 : 0)) ** 2, 0) / 끝난.length : null;
  const 반 = Math.floor(끝난.length / 2);
  const 앞 = 끝난.slice(0, 반), 뒤 = 끝난.slice(반);
  const b = (xs: LedgerEntry[]) => (xs.length ? xs.reduce((a, e) => a + (e.predictedPass - (e.passed ? 1 : 0)) ** 2, 0) / xs.length : null);
  return {
    판: 끝난.length,
    통과: 끝난.filter((e) => e.passed).length,
    달러: 일값,
    /** 판단에 든 값 / 그 몫. 몫이 크면 판단이 세금이다(11-20 첫 판: 판단이 일의 4배). */
    판단값,
    판단몫: 일값 + 판단값 > 0 ? 판단값 / (일값 + 판단값) : null,
    /** 장부가 답해서 판단자를 안 부른 판. */
    장부로: 끝난.filter((e) => e.via === "장부").length,
    아낀어림,
    brier,
    /** 늘 장부 통과율을 찍는 판단자의 Brier. */
    바보brier,
    /** 1 − brier/바보brier. 양수면 바보보다 낫다. 실패가 없으면 null(못 잼). */
    실력: brier != null && 바보brier ? 1 - brier / 바보brier : null,
    떠본판: 끝난.filter((e) => e.via === "탐색").length,
    올린판: 끝난.filter((e) => e.via === "올림").length,
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
      estimate: o.estimate, why: o.why, risk: o.risk, usd, via: "판단자",
      ...(맞는자리 ? {} : { guard: `없는 자리 "${o.seat}" 를 골라 ${ids[0]} 로 돌렸다` }),
    };
  } catch (e) {
    return { seat: ids[0], effort: "보통", predictedPass: 0.5, estimate: "모르겠다", why: "", risk: "", usd: 0, via: "난간",
      guard: `판단자가 정하지 못했다(${e instanceof Error ? e.message.slice(0, 80) : e}) — 첫 자리로 간다` };
  }
}

/* ────────────────────────────── 빠른 길 (모델 0) ────────────────────────────── */

/**
 * 장부가 이미 답하는 판단에는 판단자를 부르지 않는다.
 *
 * 11-20 첫 판: 판단자 한 번($0.024)이 일 한 판($0.006)의 네 배였다 — 같은 종류의 일을 같은 싼 AI 가
 * 계속 넘는데 매번 비싼 머리에게 물었다. 장부에 "이 종류는 이 AI 가 넘는다" 가 충분히 쌓였으면 그걸 쓴다.
 *
 * 문턱(숫자는 여기 한 곳):
 * - 그 (AI × 종류) 에 끝난 판이 `minRuns` 이상
 * - 통과 어림 (통과+1)/(판+2) 이 `minPass` 이상 — 5/5 는 0.86 이라 넘고, 4/5 는 0.71 이라 못 넘는다
 * - 최근 `recent` 판에 실패가 없다 — 모델이 바뀌거나 일이 어려워지면 바로 판단자에게 돌아간다
 * 넘는 자리가 여럿이면 **장부상 판당 값이 제일 싼 것**. 목록 단가가 아니라 실제로 나간 돈이다.
 */
export const FAST = { minRuns: 5, minPass: 0.8, recent: 2 } as const;
/** 장부가 답하는 종류에서 몇 판마다 한 번 더 싼 자리를 떠보나. */
export const EXPLORE = { every: 5 } as const;

export function fastPath(seats: Seat[], ledger: LedgerEntry[], kind: string): Decision | null {
  const 끝난 = ledger.filter((e) => e.passed !== undefined && e.kind === kind);
  const 후보: { id: string; n: number; pass: number; p: number; usd: number; effort: Effort }[] = [];
  for (const s of seats) {
    const xs = 끝난.filter((e) => e.seat === s.id);
    if (xs.length < FAST.minRuns) continue;
    if (xs.slice(-FAST.recent).some((e) => !e.passed)) continue;
    const pass = xs.filter((e) => e.passed).length;
    const p = (pass + 1) / (xs.length + 2);
    if (p < FAST.minPass) continue;
    // 노력: 통과한 판에서 제일 많이 쓴 것, 같으면 가벼운 쪽.
    const 셈 = new Map<Effort, number>();
    for (const e of xs) if (e.passed) 셈.set(e.effort, (셈.get(e.effort) ?? 0) + 1);
    const effort = [...EFFORTS].sort((a, b) => (셈.get(b) ?? 0) - (셈.get(a) ?? 0) || EFFORTS.indexOf(a) - EFFORTS.indexOf(b))[0];
    후보.push({ id: s.id, n: xs.length, pass, p, usd: xs.reduce((a, e) => a + (e.usd ?? 0), 0) / xs.length, effort });
  }
  if (!후보.length) return null;
  후보.sort((a, b) => a.usd - b.usd);
  const c = 후보[0];
  /*
   * **싼 쪽 떠보기** (11-21 사장님 "판단 엔진을 강화"). 장부가 답하기 시작하면 그 자리에 굳는다 —
   * 더 싼 AI 가 같은 일을 해낼 수 있어도 영영 모른다(11-20 그림 시험: 운영 기본보다 25% 싼 flare-low 가
   * 같은 결을 냈는데, 엔진이었다면 못 찾았다). 그래서 이 종류의 판이 `EXPLORE.every` 번째가 될 때마다
   * **아직 덜 써 본 더 싼 자리** 하나를 시킨다. 최근에 떨어진 자리는 안 떠본다. 판단자는 여전히 안 부른다.
   */
  const 이종류판 = ledger.filter((e) => e.kind === kind).length;
  const 굳은단가 = seats.find((s) => s.id === c.id)?.outPerMTok;
  if (굳은단가 != null && (이종류판 + 1) % EXPLORE.every === 0) {
    const 더싼 = seats
      .filter((s) => s.outPerMTok != null && s.outPerMTok < 굳은단가)
      .filter((s) => { const xs = 끝난.filter((e) => e.seat === s.id); return xs.length < FAST.minRuns && !xs.slice(-FAST.recent).some((e) => !e.passed); })
      .sort((a, b) => (a.outPerMTok ?? 0) - (b.outPerMTok ?? 0)).reverse()[0]; // 바로 아래 칸부터(한 번에 너무 내려가지 않게)
    if (더싼) {
      const xs = 끝난.filter((e) => e.seat === 더싼.id), pass = xs.filter((e) => e.passed).length;
      return {
        seat: 더싼.id, effort: c.effort, predictedPass: Math.round(((pass + 1) / (xs.length + 2)) * 100) / 100,
        estimate: `${c.id} 보다 출력 단가가 ${Math.round((1 - (더싼.outPerMTok ?? 0) / 굳은단가) * 100)}% 싸다`,
        why: `떠보기: "${kind}" 은 ${c.id} 가 ${c.pass}/${c.n} 로 굳었다. ${이종류판 + 1}번째 판이라 더 싼 ${더싼.id}(이 종류 ${pass}/${xs.length})를 한 번 시켜 본다.`,
        risk: "떨어질 수 있다 — 떨어지면 기록하고 다음 판은 굳은 자리로 돌아간다(director_record 가 올릴 자리를 알려 준다).",
        usd: 0, via: "탐색",
      };
    }
  }
  return {
    seat: c.id, effort: c.effort, predictedPass: Math.round(c.p * 100) / 100,
    estimate: `판당 약 $${c.usd.toFixed(3)} (장부 ${c.n}판 평균)`,
    why: `장부가 답했다: "${kind}" 을 ${c.id} 가 ${c.pass}/${c.n} 넘었고 최근 실패가 없다. 판단자를 부르지 않았다.` +
      (후보.length > 1 ? ` 같은 문턱을 넘은 ${후보.length - 1}곳보다 판당 값이 싸다.` : ""),
    risk: "장부가 쌓인 뒤 일이 어려워졌다면 한 판은 떨어질 수 있다 — 떨어지면 다음 판부터 판단자에게 돌아간다.",
    usd: 0, via: "장부",
  };
}

/** 판단의 문 — 장부가 답하면 값 0, 아니면 판단자 한 번. 손님 쪽에서 부르는 것은 이것 하나다. */
export async function decide(
  brain: AIProvider,
  input: { task: string; kind: string; seats: Seat[]; ledger: LedgerEntry[] },
  meter?: (usage: { model: string; inputTokens: number; outputTokens: number }) => number,
): Promise<Decision> {
  return fastPath(input.seats, input.ledger, input.kind) ?? decideFor(brain, input, meter);
}

/* ────────────────────────────── 떨어지면 올리기 (모델 0) ────────────────────────────── */

/**
 * **틀리면 다시 시킨다** — 팔 물건의 한 줄에 적어 놓고 11-20 까지 없던 것(11-21 "판단 엔진을 강화").
 *
 * 떨어진 판 하나를 받아 **한 칸 위**를 정한다. 판단자를 부르지 않는다 — 규칙이 뻔하고, 떨어진 직후에
 * 또 돈을 쓰게 하지 않는다.
 * - 같은 종류에서 이미 나빴던 자리(통과 어림 < 0.5, 2판 이상)는 건너뛴다
 * - 떨어진 자리보다 출력 단가가 높은 자리 중 **제일 싼 것** (한 번에 맨 위로 뛰지 않는다)
 * - 더 위가 없으면 같은 자리로 **공들이기를 한 칸 올린다**(가볍게→보통→꼼꼼히)
 * - 그것도 끝이면 null — **사람에게 넘길 때다.** 기계가 끝없이 다시 돌리지 않는다.
 */
export function escalate(seats: Seat[], ledger: LedgerEntry[], failed: LedgerEntry): Decision | null {
  const 단가 = seats.find((s) => s.id === failed.seat)?.outPerMTok;
  const 나쁨 = (id: string) => {
    const xs = ledger.filter((e) => e.passed !== undefined && e.kind === failed.kind && e.seat === id);
    return xs.length >= 2 && (xs.filter((e) => e.passed).length + 1) / (xs.length + 2) < 0.5;
  };
  const 위 = 단가 == null ? undefined : seats
    .filter((s) => s.outPerMTok != null && s.outPerMTok > 단가 && !나쁨(s.id))
    .sort((a, b) => (a.outPerMTok ?? 0) - (b.outPerMTok ?? 0))[0];
  const 판 = (seat: string) => {
    const xs = ledger.filter((e) => e.passed !== undefined && e.kind === failed.kind && e.seat === seat);
    return Math.round(((xs.filter((e) => e.passed).length + 1) / (xs.length + 2)) * 100) / 100;
  };
  if (위) return {
    seat: 위.id, effort: failed.effort, predictedPass: 판(위.id), estimate: `출력 단가 ${단가} → ${위.outPerMTok}`,
    why: `${failed.seat} 가 "${failed.kind}" 에서 떨어졌다. 한 칸 위 ${위.id} 로 다시 시킨다(판단자 안 부름).`,
    risk: "같은 이유(주문이 모호함·확인이 틀림)로 떨어진 거라면 위로 가도 안 된다 — 두 번 떨어지면 주문과 확인을 의심할 것.",
    usd: 0, via: "올림",
  };
  const i = EFFORTS.indexOf(failed.effort);
  if (i < EFFORTS.length - 1) return {
    seat: failed.seat, effort: EFFORTS[i + 1], predictedPass: 판(failed.seat), estimate: `고치기 ${roundsOf(failed.effort)} → ${roundsOf(EFFORTS[i + 1])}바퀴`,
    why: `${failed.seat} 위로 갈 자리가 없다. 같은 자리로 공들이기를 ${failed.effort} → ${EFFORTS[i + 1]} 로 올린다.`,
    risk: "바퀴를 늘려도 안 되는 일일 수 있다.", usd: 0, via: "올림",
  };
  return null;
}

/** effort → 고치기 바퀴 수. 로키의 `roundsFor` 와 같은 숫자(가볍게 1 · 보통 3 · 꼼꼼히 8). */
export const roundsOf = (e: Effort): number => (e === "가볍게" ? 1 : e === "꼼꼼히" ? 8 : 3);
