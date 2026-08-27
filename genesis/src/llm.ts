import Anthropic from "@anthropic-ai/sdk";
import { ALL_APPROACHES } from "./agents.ts";
import type { Choice } from "./agents.ts";
import type { Approach, Situation, Verdict } from "./types.ts";

/**
 * LLM 에이전트 — 규칙 표 대신 모델이 예측한다.
 *
 * 이 파일의 목적은 하나다. Phase 3 리뷰에서 세운 판정 기준을 실제로
 * 재는 것:
 *
 *   축적된 규칙을 쓴 예측이, 같은 문제를 맨몸으로 보는 LLM보다
 *   나은가. 그리고 그 격차가 시간이 갈수록 벌어지는가.
 *
 * 그래서 조건을 공평하게 맞춘다. LLM도 기억을 갖는다 — 최근 경험을
 * 프롬프트에 그대로 넣어 준다. 다만 그 기억은 컨텍스트 창 크기만큼만
 * 살아 있고, 규칙으로 압축되지 않는다. 그 차이가 이 실험의 전부다.
 *
 * 예측 잠금은 여기서도 지켜진다. decide() 는 결과를 보기 전에
 * 호출되고, 반환한 확률은 원장에 동결된다. 모델이 무엇을 하든 그
 * 순서는 코드 구조상 뒤집을 수 없다.
 */

const MODEL = process.env.GENESIS_MODEL ?? "claude-opus-5";
/** 16개 중 하나를 고르는 일이라 낮은 노력으로 충분하다. 비용 조절용. */
const EFFORT = process.env.GENESIS_EFFORT ?? "low";
/** 프롬프트에 넣어 줄 최근 경험 수 = LLM의 기억 용량. */
const RECALL = Number(process.env.GENESIS_RECALL ?? 30);

const SYSTEM = `당신은 회사에서 업무를 수행하는 직원이다.

업무마다 조건(종류 / 대상 독자 / 긴급도)이 주어지고, 당신은 네 가지
축으로 접근 방식을 정한다.

  depth  : shallow | deep     (얕게 / 깊게)
  length : short | long       (짧게 / 길게)
  cites  : yes | no           (출처 표기 여부)
  tone   : formal | casual    (격식 / 편안함)

심사자가 결과를 approved / revision / rejected 로 판정한다.
심사 기준은 당신에게 공개되지 않는다. 과거 결과에서 역산해야 한다.

주의할 점 세 가지.

1. 기준 중 일부는 조건이 겹칠 때만 적용된다. "A일 때"가 아니라
   "A이면서 동시에 B일 때"만 걸리는 규칙이 있다.
2. 아무 잘못이 없어도 일정 비율은 수정 요청이 온다. 모든 실패에
   원인이 있다고 가정하지 마라.
3. 심사 기준은 도중에 바뀔 수 있다. 예전에 통했던 방식이 지금도
   통한다고 믿지 마라. 최근 결과에 더 무게를 둬라.

당신은 두 가지를 답한다.
  - 이번에 쓸 접근 방식
  - 그 접근이 승인될 확률 (0.0 ~ 1.0)

확률은 정직해야 한다. 나중에 실제 승인률과 대조해 캘리브레이션을
측정한다. 0.9라고 말한 것들 중 실제로 90%가 승인되어야 한다.
자신 없으면 자신 없다고 말하는 편이 높게 부르고 틀리는 것보다 낫다.`;

const SCHEMA = {
  type: "object",
  properties: {
    depth: { type: "string", enum: ["shallow", "deep"] },
    length: { type: "string", enum: ["short", "long"] },
    cites: { type: "string", enum: ["yes", "no"] },
    tone: { type: "string", enum: ["formal", "casual"] },
    pApproved: { type: "number" },
    reason: { type: "string" },
  },
  required: ["depth", "length", "cites", "tone", "pApproved", "reason"],
  additionalProperties: false,
} as const;

type Past = { situation: Situation; approach: Approach; verdict: Verdict };

function situationLine(s: Situation): string {
  return `종류=${s.kind} 독자=${s.audience} 긴급도=${s.urgency}`;
}

function pastLine(p: Past, i: number): string {
  const a = p.approach;
  return `${String(i).padStart(3)}. ${situationLine(p.situation)} | ${a.depth}/${a.length}/cites:${a.cites}/${a.tone} → ${p.verdict}`;
}

export class LlmAgent {
  readonly name = `LLM (${MODEL})`;
  private client = new Anthropic();
  private past: Past[] = [];
  private inTokens = 0;
  private outTokens = 0;

  /** 실제 호출 없이 프롬프트만 만들어 본다. 비용 추정용. */
  buildPrompt(s: Situation): string {
    const recent = this.past.slice(-RECALL);
    const history =
      recent.length === 0
        ? "(아직 경험 없음)"
        : recent.map((p, i) => pastLine(p, this.past.length - recent.length + i + 1)).join("\n");

    return `# 최근 경험 (오래된 것 → 최신)
${history}

# 이번 업무
${situationLine(s)}

접근 방식과 승인 확률을 정하라.`;
  }

  async decide(s: Situation): Promise<Choice> {
    // ── 지출 잠금 ──────────────────────────────────────────────
    //
    // 이 파일은 유일하게 실제 비용이 발생하는 경로다. 프로토타입이
    // 완성될 때까지는 돌지 않는다. 실수로 호출되는 일이 없도록
    // 코드에서 막는다 — 주석이나 기억이 아니라.
    if (process.env.GENESIS_SPEND !== "i-approve") {
      throw new Error(
        "LLM 에이전트는 잠겨 있다. 실제 API 비용이 발생한다.\n" +
          "돌리려면 GENESIS_SPEND=i-approve 를 명시적으로 설정할 것.",
      );
    }

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      output_config: {
        effort: EFFORT as "low" | "medium" | "high",
        format: { type: "json_schema", schema: SCHEMA },
      },
      system: [
        { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: this.buildPrompt(s) }],
    });

    this.inTokens += response.usage.input_tokens;
    this.outTokens += response.usage.output_tokens;

    if (response.stop_reason === "refusal") {
      throw new Error("모델이 요청을 거부했다");
    }

    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new Error("텍스트 블록이 없다");
    const out = JSON.parse(text.text) as {
      depth: Approach["depth"];
      length: Approach["length"];
      cites: Approach["cites"];
      tone: Approach["tone"];
      pApproved: number;
      reason: string;
    };

    const approach: Approach = {
      depth: out.depth,
      length: out.length,
      cites: out.cites,
      tone: out.tone,
    };
    if (!ALL_APPROACHES.some((a) => JSON.stringify(a) === JSON.stringify(approach))) {
      throw new Error(`유효하지 않은 접근: ${JSON.stringify(approach)}`);
    }

    return {
      approach,
      pApproved: Math.min(0.97, Math.max(0.02, out.pApproved)),
      basis: out.reason.slice(0, 80),
      explored: false,
    };
  }

  learn(s: Situation, a: Approach, verdict: Verdict): void {
    this.past.push({ situation: s, approach: a, verdict });
  }

  get usage(): { inTokens: number; outTokens: number } {
    return { inTokens: this.inTokens, outTokens: this.outTokens };
  }
}

/** 1M 토큰당 가격 (입력, 출력). 비용 추정용. */
export const PRICING: Record<string, [number, number]> = {
  "claude-opus-5": [5, 25],
  "claude-sonnet-5": [3, 15],
  "claude-haiku-4-5": [1, 5],
};

export { MODEL, EFFORT, RECALL };
