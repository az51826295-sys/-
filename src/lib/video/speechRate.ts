import type { Supabase } from "@/lib/execution/shared";

/**
 * **이 목소리는 초당 몇 자를 읽나 — 상수가 아니라 실측** (158회차 09-17).
 *
 * 대본 프롬프트에 "초당 약 5자" 라고 내가 적어 뒀다. 첫 진짜 판(20초 주문)에서 대본은 그 셈으로 96자를 썼고,
 * 목소리는 14.9초에 끝나 **15.7초**가 나왔다 — 실측은 6.4자/초였다. 셈이 틀린 게 아니라 **내가 준 숫자**가 틀렸다.
 * 그래서 이제 지난 영상들의 (읽은 글자 수 ÷ 목소리 길이) 를 재서 그 값을 대 준다. 기계가 사실을 대고, 판단은 대본이 한다.
 */
/**
 * 장면 길이 = **여백 + 글자당 초**. "초당 N자" 한 숫자로는 안 된다 — 55장면 평균은 4.93자/초였는데 96자짜리 한 장면은
 * 6.4자/초였다. 짧은 장면일수록 목소리 앞뒤 여백(≈0.5초)이 비율을 낮춘다. 그래서 직선 하나를 맞춘다: sec = a + b·chars.
 */
export type SpeechModel = { overheadSec: number; secPerChar: number; scenes: number; measured: boolean };
export const DEFAULT_SPEECH: SpeechModel = { overheadSec: 0.5, secPerChar: 0.18, scenes: 0, measured: false };

export async function speechRate(db: Supabase, companyId: string): Promise<SpeechModel> {
  const { data } = await db
    .from("deliverables")
    .select("content_json")
    .eq("company_id", companyId).eq("deliverable_type", "video")
    .order("created_at", { ascending: false }).limit(40);
  const xs: number[] = [], ys: number[] = [];
  for (const row of (data ?? []) as { content_json: { script?: { scenes?: { narration?: string }[] }; durations?: number[]; look?: { pad?: number } } | null }[]) {
    const cj = row.content_json;
    const scenes = cj?.script?.scenes ?? [];
    const durations = cj?.durations ?? [];
    // 장면 길이 = 목소리 + 쉼. 쉼은 그 판의 연출값(없으면 옛 상수 0.4).
    const pad = typeof cj?.look?.pad === "number" ? cj.look.pad : 0.4;
    for (let i = 0; i < Math.min(scenes.length, durations.length); i++) {
      const c = (scenes[i].narration ?? "").replace(/\s+/g, "").length;
      const sec = durations[i] - pad;
      if (c >= 10 && sec > 0.5) { xs.push(c); ys.push(sec); }
    }
  }
  // 226회차 09-28: **옛 장면이 직선을 끌고 있었다.** 96장면으로 맞춘 직선은 최근 30장면에 대해
  // 장면당 **+0.56초** 치우쳐 있었고(최근 것만으로 맞추면 0.00), 그 치우침이 장면 수만큼 곱해져
  // 15장면 영상에서 **+8.5초**가 됐다. 목소리 설정이 그 사이 바뀐 것이다.
  //
  // 한 장면 오차는 평균 0.73초로 작았다 — **치우침은 평균으로 안 보인다.** 그래서 창을 줄인다.
  // 40개 결과물(≈96장면) 전부가 아니라 **최근 장면 30개**로 맞춘다. 30 미만이면 있는 만큼 쓴다.
  const WINDOW = 30;
  if (xs.length > WINDOW) { xs.length = WINDOW; ys.length = WINDOW; }
  const n = xs.length;
  if (n < 5) return { ...DEFAULT_SPEECH, scenes: n };
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const b = sxx > 0 ? sxy / sxx : DEFAULT_SPEECH.secPerChar;
  const a = my - b * mx;
  // 난간: 말도 안 되는 직선(음수 기울기·음수 여백)이면 기본값. 잰 값이 이상하면 이상하다고 두지 않고 기본으로 간다.
  //
  // 226회차 09-28: **이 난간이 맞는 값을 버릴 참이었다.** 창을 최근 30장면으로 줄이니 실측 여백이
  // **3.07초**로 나왔는데 문턱이 `a > 3` 이었다 — 한 칸 차이로 좋은 직선을 버리고 기본값(0.5초)으로
  // 떨어졌을 것이고, 그건 **지금보다 더 나쁘다.** 난간은 조용히 떨어뜨리므로 눈에도 안 띈다.
  // 그래서 5초로 넓힌다(장면마다 여는 글자·페이드·앞뒤 쉼을 합치면 3초대는 있을 수 있다).
  // **잰 값이 난간에 가까워지면 난간을 다시 본다** — 오늘 "한쪽만 막힌 자" 와 같은 종류다.
  const 난간밖 = b <= 0.05 || b > 0.6 || a < 0 || a > 5;
  if (난간밖) {
    console.warn(`[speechRate] 직선이 난간 밖이라 기본값으로 간다 — 여백 ${a.toFixed(2)}s · 글자당 ${b.toFixed(3)}s (${n}장면). 난간이 맞는지 먼저 본다.`);
    return { ...DEFAULT_SPEECH, scenes: n };
  }
  return { overheadSec: a, secPerChar: b, scenes: n, measured: true };
}

/** 대본에 대 줄 한 줄. */
export function speechLine(m: SpeechModel): string {
  return m.measured
    ? `이 목소리는 실측으로 장면마다 여백 약 ${m.overheadSec.toFixed(1)}초 + 글자당 ${m.secPerChar.toFixed(3)}초 (지난 ${m.scenes}장면에서 직선을 맞춤). 즉 seconds ≈ ${m.overheadSec.toFixed(1)} + ${m.secPerChar.toFixed(3)}×글자수 + 쉼(look.pad).`
    : `이 목소리의 실측이 아직 없다 — 대략 장면마다 여백 0.5초 + 글자당 0.18초로 잡아라.`;
}
