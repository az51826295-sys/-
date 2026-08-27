import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Experience, Outcome, Prediction } from "./types.ts";

/**
 * 예측 원장 (Prediction Ledger).
 *
 * Genesis에서 가장 중요한 한 조각. 예측은 결과를 보기 전에 커밋되고,
 * 그 뒤로는 수정할 수 없다.
 *
 * 이게 없으면 "예측 오차"는 아무 의미도 없는 숫자다. 결과를 본 다음에
 * 예측을 적을 수 있는 시스템에서 AI는 언제나 정확하다.
 *
 * 여기서는 세 가지로 강제한다.
 *   1. commit 이후 그 예측 객체는 동결된다 (Object.freeze)
 *   2. 같은 예측에 결과를 두 번 붙일 수 없다
 *   3. 등록되지 않은 예측에는 결과를 붙일 수 없다
 *
 * 실제 Supabase 구현에서는 이 세 가지가 앱 코드의 약속이 아니라
 * DB 제약이어야 한다. 코드는 언젠가 잊는다.
 */
export class Ledger {
  private predictions = new Map<string, Prediction>();
  private settled = new Set<string>();
  private lines: string[] = [];
  private seq = 0;
  private readonly path?: string;

  constructor(path?: string) {
    this.path = path;
    if (path) mkdirSync(dirname(path), { recursive: true });
  }

  /** 행동 이전에 호출된다. 이 시점 이후 예측은 바뀌지 않는다. */
  commit(p: Omit<Prediction, "id" | "committedAt">): Prediction {
    const prediction: Prediction = Object.freeze({
      ...p,
      id: `PRD-${(++this.seq).toString().padStart(7, "0")}`,
      committedAt: this.seq, // 실제 구현에서는 서버 타임스탬프
    });
    this.predictions.set(prediction.id, prediction);
    this.lines.push(JSON.stringify({ t: "prediction", ...prediction }));
    return prediction;
  }

  /** 결과를 붙인다. 예측 행은 건드리지 않는다. */
  settle(outcome: Outcome): Experience {
    const prediction = this.predictions.get(outcome.predictionId);
    if (!prediction) {
      throw new Error(
        `등록되지 않은 예측에 결과를 붙이려 했다: ${outcome.predictionId}`,
      );
    }
    if (this.settled.has(outcome.predictionId)) {
      throw new Error(`이미 결과가 확정된 예측이다: ${outcome.predictionId}`);
    }
    this.settled.add(outcome.predictionId);

    const actual = outcome.verdict === "approved" ? 1 : 0;
    const experience: Experience = {
      prediction,
      outcome,
      error: Math.abs(prediction.pApproved - actual),
      cost: 1,
    };
    this.lines.push(JSON.stringify({ t: "outcome", ...outcome }));
    return experience;
  }

  /** 결과가 안 붙은 예측이 남아 있으면 그건 버그다. */
  get openPredictions(): number {
    return this.predictions.size - this.settled.size;
  }

  flush(): void {
    if (!this.path || this.lines.length === 0) return;
    appendFileSync(this.path, this.lines.join("\n") + "\n", "utf8");
    this.lines = [];
  }
}
