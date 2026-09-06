import type { SupabaseClient } from "@supabase/supabase-js";

type Supabase = SupabaseClient;

/**
 * 단계 저장 — 죽어도 그 단계부터 다시.
 *
 * 09-06 밤 계획 2("안 죽는 실행"). 실행이 웹 프로세스 안에서 돌아 배포·DB 정지마다 죽었고(오늘
 * 두 번), 죽으면 계획·코드 생성값을 전부 다시 냈다. Inngest·Temporal 이 하는 일의 핵심은
 * "비싼 단계의 결과를 저장해 두고, 다시 돌 때는 그 결과를 읽는다" 이다. 계정이 필요 없는
 * 우리 DB 로 그것만 한다: `work_executions.metrics_json.steps[이름]`.
 *
 * 쓰는 법: `await step(db, executionId, "plan", () => 모델 호출)`. 같은 실행을 다시 돌리면
 * "plan" 은 저장된 값이 바로 돌아오고 모델을 안 부른다. 값은 JSON 이어야 한다(그림 base64 같은
 * 큰 것은 넣지 말고 경로를 넣는다 — 행이 뚱뚱해지면 DB 가 멈춘다, 09-06 19:30).
 *
 * 저장은 단계마다 한 번씩 읽고-합쳐-쓴다. 한 실행은 한 프로세스만 돌리므로 경쟁은 없다.
 */
export async function step<T>(
  db: Supabase,
  executionId: string,
  name: string,
  run: () => Promise<T>,
): Promise<T> {
  const saved = await readSteps(db, executionId);
  if (name in saved) {
    console.log(`[steps] ${name}: 저장된 값으로 (다시 안 부른다)`);
    return saved[name] as T;
  }
  const value = await run();
  const size = JSON.stringify(value ?? null).length;
  if (size > 400_000) {
    // 큰 값은 저장하지 않는다 — 다음에 다시 돌면 이 단계는 다시 한다. 행이 커지는 것보다 낫다.
    console.warn(`[steps] ${name}: ${Math.round(size / 1024)} KB 라 저장 안 함`);
    return value;
  }
  const latest = await readSteps(db, executionId);
  latest[name] = value;
  await db
    .from("work_executions")
    .update({ metrics_json: { ...(await readMetrics(db, executionId)), steps: latest }, updated_at: new Date().toISOString() })
    .eq("id", executionId);
  return value;
}

async function readMetrics(db: Supabase, executionId: string): Promise<Record<string, unknown>> {
  const { data } = await db.from("work_executions").select("metrics_json").eq("id", executionId).maybeSingle();
  const m = data?.metrics_json;
  return m && typeof m === "object" ? (m as Record<string, unknown>) : {};
}

async function readSteps(db: Supabase, executionId: string): Promise<Record<string, unknown>> {
  const m = await readMetrics(db, executionId);
  const s = m.steps;
  return s && typeof s === "object" ? { ...(s as Record<string, unknown>) } : {};
}

/** 살아 있다는 표시. 오래 걸리는 단계(메시 생성 폴링) 안에서 주기적으로 부른다. */
export async function heartbeat(db: Supabase, executionId: string): Promise<void> {
  await db.from("work_executions").update({ updated_at: new Date().toISOString() }).eq("id", executionId);
}
