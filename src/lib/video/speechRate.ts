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
  const n = xs.length;
  if (n < 5) return { ...DEFAULT_SPEECH, scenes: n };
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const b = sxx > 0 ? sxy / sxx : DEFAULT_SPEECH.secPerChar;
  const a = my - b * mx;
  // 난간: 말도 안 되는 직선(음수 기울기·음수 여백)이면 기본값. 잰 값이 이상하면 이상하다고 두지 않고 기본으로 간다.
  if (b <= 0.05 || b > 0.6 || a < 0 || a > 3) return { ...DEFAULT_SPEECH, scenes: n };
  return { overheadSec: a, secPerChar: b, scenes: n, measured: true };
}

/** 대본에 대 줄 한 줄. */
export function speechLine(m: SpeechModel): string {
  return m.measured
    ? `이 목소리는 실측으로 장면마다 여백 약 ${m.overheadSec.toFixed(1)}초 + 글자당 ${m.secPerChar.toFixed(3)}초 (지난 ${m.scenes}장면에서 직선을 맞춤). 즉 seconds ≈ ${m.overheadSec.toFixed(1)} + ${m.secPerChar.toFixed(3)}×글자수 + 쉼(look.pad).`
    : `이 목소리의 실측이 아직 없다 — 대략 장면마다 여백 0.5초 + 글자당 0.18초로 잡아라.`;
}
