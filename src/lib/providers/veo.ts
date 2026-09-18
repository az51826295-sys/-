/**
 * **영상 모델 두 번째 자리 — Veo 3.1** (182회차 09-18).
 *
 * OpenAI 폐기표: Videos API · `sora-2` · `sora-2-pro` 를 **2026-09-24 제거**(대체 없음). 영상 직원의 "실제 장면" 이 그날 죽는다.
 * 시장조사(engine/docs/model-market-2026-09-18.md)에서 제일 싼 길이 Veo 3.1 Lite(초당 ≈$0.05, Sora 의 반값)였고 사장님 "해".
 *
 * 붙는 법은 Sora 와 같다: 주문 → 될 때까지 물어봄 → 내려받음. 다른 것은 열쇠(`GEMINI_API_KEY`, 헤더 `x-goog-api-key`)와
 * 길이(4·6·8초)뿐. 실패하면 던진다 — 부르는 쪽(`videoMake`)이 글자 카드로 돌아간다(Sora 때와 같다).
 */

export type VeoClip = { mp4: Buffer; seconds: number; model: string };

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export const VEO_MODELS = {
  lite: "veo-3.1-lite-generate-preview",
  fast: "veo-3.1-fast-generate-preview",
  full: "veo-3.1-generate-preview",
} as const;
export type VeoTier = keyof typeof VEO_MODELS;

/** 초는 모델이 받는 값으로만(4·6·8). */
export const VEO_SECONDS = [4, 6, 8] as const;
export const nearestVeoSeconds = (want: number): number =>
  VEO_SECONDS.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a), VEO_SECONDS[0]);

/** 공표 단가(초당, 720p·무음 기준 근사). 장부용 — 정확한 값은 pricing.ts 가 이긴다. */
export const VEO_USD_PER_SECOND: Record<VeoTier, number> = { lite: 0.05, fast: 0.15, full: 0.40 };

export function veoConfigured(): boolean { return !!process.env.GEMINI_API_KEY; }

export async function makeVeoClip(opts: {
  prompt: string;
  seconds?: number;
  tier?: VeoTier;
  /** "16:9"(기본) | "9:16" */
  aspect?: "16:9" | "9:16";
  /** 소리까지 만들면 값이 오른다(30~100%). 우리 영상은 TTS 를 따로 얹으니 기본 무음. */
  audio?: boolean;
  signal?: AbortSignal;
}): Promise<VeoClip> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY 가 없다");
  const tier = opts.tier ?? ((process.env.VEO_TIER as VeoTier | undefined) ?? "lite");
  const model = VEO_MODELS[tier] ?? VEO_MODELS.lite;
  const seconds = nearestVeoSeconds(opts.seconds ?? 8);
  const headers = { "x-goog-api-key": key, "content-type": "application/json" };

  const start = await fetch(`${BASE}/models/${model}:predictLongRunning`, {
    method: "POST", headers, signal: opts.signal,
    body: JSON.stringify({
      instances: [{ prompt: opts.prompt }],
      parameters: { aspectRatio: opts.aspect ?? "16:9", durationSeconds: String(seconds), resolution: "720p", numberOfVideos: 1, generateAudio: opts.audio === true },
    }),
  });
  if (!start.ok) throw new Error(`영상 주문 거절(${start.status}): ${(await start.text()).slice(0, 300)}`);
  const op = (await start.json()) as { name: string; done?: boolean };
  if (!op.name) throw new Error("영상 주문에 작업 이름이 없다");

  // 다 될 때까지. 8초짜리가 1~3분 — 넉넉히 두되 영원히는 아니다.
  const deadline = Date.now() + 12 * 60 * 1000;
  let done = op.done === true;
  let last: { done?: boolean; error?: { message?: string }; response?: { generateVideoResponse?: { generatedSamples?: { video?: { uri?: string } }[]; raiMediaFilteredCount?: number; raiMediaFilteredReasons?: string[] } } } = op;
  while (!done && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 6000));
    const p = await fetch(`${BASE}/${op.name}`, { headers: { "x-goog-api-key": key }, signal: opts.signal });
    if (!p.ok) throw new Error(`상태 못 물어봄(${p.status})`);
    last = await p.json();
    done = last.done === true;
    if (last.error) throw new Error(`영상 만들기 실패: ${last.error.message ?? "알 수 없음"}`);
  }
  if (!done) throw new Error("영상이 12분 안에 안 나왔다");
  const gv = last.response?.generateVideoResponse;
  const uri = gv?.generatedSamples?.[0]?.video?.uri;
  if (!uri) throw new Error(`영상이 안 나왔다${gv?.raiMediaFilteredCount ? ` (안전 필터 ${gv.raiMediaFilteredCount}건: ${(gv.raiMediaFilteredReasons ?? []).join(" / ").slice(0, 200)})` : ""}`);
  const dl = await fetch(uri, { headers: { "x-goog-api-key": key }, redirect: "follow", signal: opts.signal });
  if (!dl.ok) throw new Error(`영상 못 내려받음(${dl.status})`);
  return { mp4: Buffer.from(await dl.arrayBuffer()), seconds, model };
}
