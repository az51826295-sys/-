/**
 * **영상을 만드는 모델** (154회차 09-16).
 *
 * 사장님: *"그냥 지피티한테 시키기만 해도 멋진 광고 하나 나오는데 이런 쓰레기 연출이 왜 계속 나와?"*
 *
 * 답은 하나였다. **로키에는 영상을 만드는 모델이 하나도 안 붙어 있었다.** 영상 배관 전체가
 * ffmpeg 으로 글자를 그리는 것이었고(149 조판 · 153 움직임 · 154 화면 녹화), 재료가 글자뿐인 데에
 * 연출만 계속 얹었다. **슬라이드쇼에 연출을 바른 것이다.** 저쪽이 멋진 건 Sora 가 붙어 있어서고,
 * 우리 키로도 `sora-2` 가 그냥 불린다 — 내가 안 붙였을 뿐이다.
 *
 * 값: 09-16 공표 단가로 `sora-2` 초당 $0.10, `sora-2-pro` 720p 초당 $0.30. 15초 광고 한 판이면 $1.50.
 * **그래서 이 길은 `GENESIS_SPEND=i-approve` 없이는 안 돈다** — 글자 카드와 값이 10배 넘게 차이난다.
 */

export type SoraClip = { mp4: Buffer; seconds: number; model: string };

const BASE = "https://api.openai.com/v1";

/** 초는 모델이 받는 값으로만 맞춘다(아무 숫자나 주면 거절당한다). */
export const SORA_SECONDS = [4, 8, 12] as const;
export const nearestSeconds = (want: number): number =>
  SORA_SECONDS.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a), SORA_SECONDS[0]);

/**
 * 한 컷을 만든다. 만드는 데 시간이 걸리므로 **다 될 때까지 물어본다**.
 * 실패하면 던진다 — 부르는 쪽(`videoMake`)이 글자 카드로 돌아갈지 정한다.
 */
export async function makeClip(opts: {
  prompt: string;
  seconds?: number;
  model?: "sora-2" | "sora-2-pro";
  size?: string;
  signal?: AbortSignal;
}): Promise<SoraClip> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY 가 없다");
  const model = opts.model ?? "sora-2";
  const seconds = nearestSeconds(opts.seconds ?? 8);
  const size = opts.size ?? "1280x720";

  const body = new FormData();
  body.set("model", model);
  body.set("prompt", opts.prompt);
  body.set("seconds", String(seconds));
  body.set("size", size);

  const start = await fetch(`${BASE}/videos`, {
    method: "POST", headers: { Authorization: `Bearer ${key}` }, body, signal: opts.signal,
  });
  if (!start.ok) throw new Error(`영상 주문 거절(${start.status}): ${(await start.text()).slice(0, 300)}`);
  const job = (await start.json()) as { id: string; status: string };

  // 다 될 때까지. 15초짜리도 몇 분 걸린다 — 넉넉히 두되 영원히 기다리지는 않는다.
  const deadline = Date.now() + 12 * 60 * 1000;
  let status = job.status;
  while (status !== "completed" && Date.now() < deadline) {
    if (status === "failed") throw new Error("영상 만들기 실패(모델이 거절)");
    await new Promise((r) => setTimeout(r, 6000));
    const p = await fetch(`${BASE}/videos/${job.id}`, { headers: { Authorization: `Bearer ${key}` }, signal: opts.signal });
    if (!p.ok) throw new Error(`상태 못 물어봄(${p.status})`);
    const j = (await p.json()) as { status: string; error?: { message?: string } };
    status = j.status;
    if (status === "failed") throw new Error(`영상 만들기 실패: ${j.error?.message ?? "알 수 없음"}`);
  }
  if (status !== "completed") throw new Error("영상이 12분 안에 안 나왔다");

  const dl = await fetch(`${BASE}/videos/${job.id}/content`, { headers: { Authorization: `Bearer ${key}` }, signal: opts.signal });
  if (!dl.ok) throw new Error(`영상 못 내려받음(${dl.status})`);
  return { mp4: Buffer.from(await dl.arrayBuffer()), seconds, model };
}
