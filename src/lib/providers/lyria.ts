/**
 * **음악 — Lyria 3.5** (226회차 2026-09-26, 사장님 "음악 붙이고").
 *
 * 이 열쇠(`GEMINI_API_KEY`)로 Lyria 가 **계속 열려 있었는데 우리는 한 번도 안 불렀다.** 광고·영상이
 * 심심했던 이유가 연출이 아니라 재료였다 — 154회차에 영상 모델이 하나도 안 붙어 있던 것과 같은 자리다.
 *
 * 부르는 법은 Veo 보다 훨씬 쉽다: 보통 `generateContent` 한 번이면 MP3 가 `inlineData` 로 온다
 * (Veo 처럼 오래 걸리는 작업이 아니다). 답에는 곡 구조도 같이 온다 — `[[A0]] [[B1]] [[C2]] [[B3]]`.
 *
 * **길이는 주문으로 못 정한다**(09-26 실측: "8초" 라고 적었는데 67초가 왔다). 필요한 만큼은
 * 받아 온 뒤에 자른다 — 그래서 이 파일은 "만들기" 까지만 하고 자르는 것은 쓰는 쪽 몫이다.
 */

export type MadeMusic = {
  /** MP3 바이트. */
  mp3: Buffer;
  /** 실제 길이(초). 주문한 길이가 아니라 **온 것을 잰 값**이다 — 재는 것은 ffprobe 가 한다. */
  model: string;
  /** 모델이 같이 준 곡 구조. 예: "[[A0]] [[B1]] [[C2]]" — 어디서 잘라야 자연스러운지의 힌트다. */
  structure: string | null;
  usd: number;
};

const BASE = "https://generativelanguage.googleapis.com/v1beta";

/** 곡당 정액(09-26 공표가). 토큰이 아니다. */
export const LYRIA_USD: Record<string, number> = {
  "lyria-3.5": 0.08,
  "lyria-3-pro-preview": 0.08,
  "lyria-3-clip-preview": 0.04,   // 30초 고정
};

export function lyriaConfigured(): boolean { return !!process.env.GEMINI_API_KEY; }

export async function makeMusic(opts: {
  /** 영어로. 분위기·악기·빠르기. 가사가 필요 없으면 "no vocals" 를 적는다. */
  prompt: string;
  /** 기본 lyria-3.5. 30초면 족한 자리는 clip 이 반값이다. */
  model?: keyof typeof LYRIA_USD | string;
  signal?: AbortSignal;
}): Promise<MadeMusic> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY 가 없다");
  const model = opts.model ?? "lyria-3.5";

  const r = await fetch(`${BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: opts.prompt }] }] }),
    signal: opts.signal ?? AbortSignal.timeout(300_000),
  });
  if (!r.ok) throw new Error(`음악 주문 거절(${r.status}): ${(await r.text()).slice(0, 300)}`);

  const j = (await r.json()) as {
    candidates?: { content?: { parts?: { text?: string; inlineData?: { data?: string; mimeType?: string } }[] } }[];
  };
  const parts = j.candidates?.[0]?.content?.parts ?? [];
  const audio = parts.find((p) => p.inlineData?.data);
  if (!audio) throw new Error("음악이 안 왔다");
  const structure = parts.find((p) => typeof p.text === "string" && p.text.trim())?.text?.trim() ?? null;

  return {
    mp3: Buffer.from(audio.inlineData!.data!, "base64"),
    model,
    structure,
    usd: LYRIA_USD[model] ?? 0.08,
  };
}
