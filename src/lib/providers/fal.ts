/**
 * **fal — 여러 손을 한 열쇠로** (226회차 2026-09-28).
 *
 * 사장님 09-28: *"제일 빠른길이 아니고 미래를 봐야지. 너무 많은양을 혼자 못해."*
 *
 * 맞는 말이라 구조를 바꾼다. 도구를 하나씩 직접 붙이면 **도구마다 사장님 손이 한 번씩** 든다 —
 * 가입·결제·키. 10개를 붙이면 10번이다. 그건 안 굴러간다.
 *
 * fal 은 모델 1,000개 남짓을 **키 하나**로 부른다. image-to-3D 만 24개가 있고
 * (Meshy 6/7/7.1 · Tripo V2.5/P2/H3.1 · Rodin/V2/V2.5/Fast · Hunyuan V2/V3/Pro/Rapid ·
 * Trellis 2 · SAM 3D), 영상·그림·소리도 같은 열쇠 아래다. **사장님 손이 10번에서 1번이 된다.**
 *
 * 특히 **Rodin** 이 여기서 열린다 — 직접 API 는 월 $120 이라 사장님 예산($21/월)으로 못 썼는데,
 * fal 을 거치면 쓴 만큼만 낸다.
 *
 * **아직 모르는 것 셋(적어 둔다, 재기 전에는 말하지 않는다)**:
 *   1. 중개 마진이 붙어 직접보다 비쌀 수 있다 — 가격은 모델 낱장에만 있고 목록엔 없다.
 *   2. Meshy 직접 API 의 **리깅·조각** 기능이 fal 경유로도 다 되는지 모른다.
 *   3. **fal 하나가 죽으면 3D 가 통째로 죽는다.** 그래서 Meshy 직접 연결은 **그대로 둔다** —
 *      단일 장애점을 만들지 않는다.
 */
const BASE = "https://fal.run";
const QUEUE = "https://queue.fal.run";

export function falKey(): string | null {
  return process.env.FAL_KEY?.trim() || process.env.FAL_API_KEY?.trim() || null;
}

export type FalRun = {
  /** 모델이 돌려준 것 그대로. 모델마다 모양이 다르므로 부르는 쪽이 읽는다. */
  out: Record<string, unknown>;
  ms: number;
  model: string;
};

/**
 * 모델 하나를 부른다. 오래 걸리는 것은 **줄(queue)** 로 부르고 끝날 때까지 묻는다.
 *
 * 오류를 **읽는다** — 09-18 에 DB 제약 거부를 안 읽어 좀비 업무가 생겼다.
 * 그리고 **429 는 기다린다** — 09-28 에 유튜브 자막이 바로 그것으로 막혔다.
 */
export async function falRun(
  modelId: string,
  input: Record<string, unknown>,
  opts: { timeoutMs?: number } = {},
): Promise<FalRun> {
  const key = falKey();
  if (!key) throw new Error("FAL_KEY 가 없다 — 사장님이 키를 넣어야 이 손이 움직인다");
  const t0 = Date.now();
  const 머리 = { Authorization: `Key ${key}`, "content-type": "application/json" };

  const 시작 = await fetch(`${QUEUE}/${modelId}`, { method: "POST", headers: 머리, body: JSON.stringify(input) });
  if (!시작.ok) {
    const 글 = await 시작.text().catch(() => "");
    throw new Error(`fal ${modelId} 시작 실패 HTTP ${시작.status} ${글.slice(0, 160)}`);
  }
  const { request_id } = (await 시작.json()) as { request_id?: string };
  if (!request_id) throw new Error(`fal ${modelId} 가 request_id 를 안 줬다`);

  const 끝 = Date.now() + (opts.timeoutMs ?? 8 * 60_000);
  while (Date.now() < 끝) {
    await new Promise((r) => setTimeout(r, 2500));
    const st = await fetch(`${QUEUE}/${modelId}/requests/${request_id}/status`, { headers: 머리 });
    if (st.status === 429) { await new Promise((r) => setTimeout(r, 10_000)); continue; }
    if (!st.ok) continue;
    const s = (await st.json()) as { status?: string };
    if (s.status === "COMPLETED") {
      const r = await fetch(`${QUEUE}/${modelId}/requests/${request_id}`, { headers: 머리 });
      if (!r.ok) throw new Error(`fal ${modelId} 결과 받기 실패 HTTP ${r.status}`);
      return { out: (await r.json()) as Record<string, unknown>, ms: Date.now() - t0, model: modelId };
    }
    if (s.status === "FAILED") throw new Error(`fal ${modelId} 판이 실패로 끝났다 (${request_id})`);
  }
  throw new Error(`fal ${modelId} 가 시간 안에 안 끝났다 (${request_id})`);
}

/** 짧은 것(그림 한 장 같은)은 줄 없이 바로. 오래 걸리는 3D 는 `falRun` 을 쓴다. */
export async function falRunNow(modelId: string, input: Record<string, unknown>): Promise<FalRun> {
  const key = falKey();
  if (!key) throw new Error("FAL_KEY 가 없다");
  const t0 = Date.now();
  const r = await fetch(`${BASE}/${modelId}`, {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(`fal ${modelId} 실패 HTTP ${r.status} ${(await r.text().catch(() => "")).slice(0, 160)}`);
  return { out: (await r.json()) as Record<string, unknown>, ms: Date.now() - t0, model: modelId };
}
