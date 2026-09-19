import { z } from "zod";
import sharp from "sharp";
import type { AIProvider } from "@/lib/providers/types";
import { buildPatch } from "@/lib/skills/appBuild/patch";
import { checkFiles } from "@/lib/skills/appBuild/verify";
import { seatProvider } from "@/lib/skills/appBuild/seats";
import { isPriced, costOf } from "@/lib/costs/pricing";
import { SEAT_BENCH_HTML } from "@/lib/genesis/seatBenchFixture";

/**
 * **자리 시험판 v0** (190회차 09-19, 2단계 3번). 사장님: "새 AI를 파악하고 갈아탄다 — 발전에 뒤처지고 싶지 않다" ·
 * "API 를 어떻게 하면 효율적으로 쓸까 — 적은 돈, 적은 시간, 좋은 결과".
 *
 * 새 모델이 목록에 나타나면(모델 감시) 소문이 아니라 **우리 일**로 잰다. 얼린 재료(두더지 게임)에 고장 셋을 심고 고치게 하고,
 * 그림 한 장을 보여 색·자리를 묻는다. 나오는 것은 셋 다 숫자다: **맞음(품질) · 초(시간) · $(돈)** — 그리고 그 셋을 하나로 접은 효율.
 * 09-14 의 시험판 v0(Ana·Vid 실제 업무, 한 바퀴 $0.86·수십 분)는 너무 비싸서 새 모델마다 못 돌린다 — 이건 모델당 ≈$0.01·30초다.
 *
 * 단가를 모르는 모델은 부르지 않는다(계량이 던진다). 그건 "단가 필요" 로 적어 사람에게 간다 — 단가는 공급자 페이지에서 사람이 적는 것이다.
 */

export type BenchBug = { name: string; ask: string; plant: (s: string) => string; fixed: (s: string) => boolean };

export const BUGS: BenchBug[] = [
  { name: "점수 안 오름", ask: "두더지를 눌러도 점수가 0에서 안 올라.", plant: (s) => s.replace(/score\s*\+=\s*1/, "score = score"), fixed: (s) => /score\s*(\+=\s*1|\+\+)/.test(s) },
  { name: "시간 안 줄어듦", ask: "남은 시간이 20에서 안 줄어들고 게임이 안 끝나.", plant: (s) => s.replace(/secondsLeft\s*-=\s*1/, "secondsLeft -= 0"), fixed: (s) => /secondsLeft\s*(-=\s*1|--)/.test(s) },
  { name: "시작 단추 안 먹음", ask: "게임 시작 단추를 눌러도 아무 일도 안 일어나.", plant: (s) => s.replace(/addEventListener\(\s*["']click["']\s*,\s*startGame/, 'addEventListener("clik", startGame'), fixed: (s) => /addEventListener\(\s*["']click["']\s*,\s*startGame/.test(s) },
];

export const CRITERIA = [
  { id: "c1", when: "게임 시작을 누르면", then: "20초 타이머가 돌고 두더지가 나타난다" },
  { id: "c2", when: "두더지를 누르면", then: "점수가 1 오른다" },
  { id: "c3", when: "시간이 0이 되면", then: "종료 화면과 점수가 보인다" },
];

export type SeatTrial = {
  model: string;
  at: string;
  /** 단가가 있어 실제로 불렀나. */
  priced: boolean;
  /** 못 앉힌 이유(열쇠 없음·오류). */
  error?: string;
  fixed: number; n: number;
  /** 문법이 깨진 판. */
  broken: number;
  changedLines: number;
  sec: number;
  usd: number;
  /** 그림을 보나(파랑 바탕·노랑 네모·왼쪽을 맞혔나). null 이면 못 물어봄. */
  sees: boolean | null;
  /** 효율 — 맞음 비율을 (초 × 달러) 로 나눈 것의 로그 눈금은 아니다: 그냥 셋을 나란히 두고 사람이 본다. 자동 고르기는 seats.ts 가 성적으로 한다. */
};

/** 계량된 자리 — 값은 장부(model_usage)가 아니라 여기서 직접 센다(시험은 회사 일이 아니다). */
function metered(ai: AIProvider, tally: { usd: number }): AIProvider {
  return {
    ...ai,
    async generateStructuredOutput(a) {
      const r = await ai.generateStructuredOutput(a);
      tally.usd += costOf({ backend: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, cachedInputTokens: r.cachedInputTokens });
      return r;
    },
  } as AIProvider;
}

export async function runSeatBench(model: string, opts?: { bugs?: BenchBug[]; skipVision?: boolean }): Promise<SeatTrial> {
  const at = new Date().toISOString();
  const base: SeatTrial = { model, at, priced: isPriced(model), fixed: 0, n: 0, broken: 0, changedLines: 0, sec: 0, usd: 0, sees: null };
  if (!base.priced) return { ...base, error: "단가 없음 — costs/pricing.ts 에 적어야 부를 수 있다" };
  const ai = await seatProvider(model);
  if (!ai) return { ...base, error: "못 앉힘(열쇠 없음 또는 모르는 공급자)" };
  const tally = { usd: 0 };
  const m = metered(ai, tally);
  const html = { path: "index.html", language: "html", contents: SEAT_BENCH_HTML };
  const bugs = opts?.bugs ?? BUGS;
  const t0 = Date.now();
  let fixed = 0, broken = 0, changed = 0, n = 0, error: string | undefined;
  for (const b of bugs) {
    const planted = b.plant(html.contents);
    if (planted === html.contents) continue;
    n++;
    try {
      const p = await buildPatch(m, { title: "터치 두더지 잡기 게임", ask: b.ask, criteria: CRITERIA, failedChecks: [], full: [{ ...html, contents: planted }], rest: [] });
      if (!p.ok) continue;
      const out = p.files.find((f) => f.path === html.path)?.contents ?? "";
      if (b.fixed(out)) fixed++;
      if (!checkFiles([{ ...html, contents: out }]).every((c) => !c.checked || c.ok)) broken++;
      changed += p.changedLines;
    } catch (e) { error = (error ? error + " / " : "") + `${b.name}: ${e instanceof Error ? e.message.slice(0, 80) : String(e)}`; }
  }
  let sees: boolean | null = null;
  if (!opts?.skipVision) {
    try {
      const png = await sharp({ create: { width: 200, height: 120, channels: 3, background: "#1030a0" } })
        .composite([{ input: await sharp({ create: { width: 60, height: 60, channels: 3, background: "#ffd000" } }).png().toBuffer(), left: 20, top: 30 }])
        .jpeg().toBuffer();
      const { output } = await m.generateStructuredOutput({
        systemInstructions: "그림을 보고 답한다. 색은 한 낱말(파랑·노랑·빨강…), 자리는 왼쪽/오른쪽.",
        input: "배경색과 네모의 색, 네모가 왼쪽인지 오른쪽인지.",
        images: [png.toString("base64")],
        schema: z.object({ background: z.string(), square: z.string(), side: z.string() }),
        schemaName: "see", maxTokens: 2000, tier: "judgment",
      });
      sees = /파랑|blue|남색|navy/i.test(output.background) && /노랑|yellow|금|gold/i.test(output.square) && /왼|left/i.test(output.side);
    } catch { sees = false; }
  }
  return { ...base, fixed, n, broken, changedLines: changed, sec: Math.round((Date.now() - t0) / 1000), usd: Math.round(tally.usd * 10000) / 10000, sees, ...(error ? { error } : {}) };
}

/** 사람이 읽는 한 줄. */
export function trialLine(t: SeatTrial): string {
  if (!t.priced) return `${t.model}: 단가 없음 — 적어 주면 시험`;
  if (t.error && t.n === 0) return `${t.model}: ${t.error}`;
  return `${t.model}: 고침 ${t.fixed}/${t.n}${t.broken ? ` · 문법 깨짐 ${t.broken}` : ""} · ${t.sec}초 · $${t.usd.toFixed(4)} · 그림 ${t.sees === null ? "?" : t.sees ? "봄" : "못 봄"}${t.error ? ` · 일부 실패(${t.error.slice(0, 60)})` : ""}`;
}
