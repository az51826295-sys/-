import { isUnmeasurableRange, type Expectation } from "@/lib/skills/appBuild/measures";

/**
 * 회사가 늘 재는 줄 (50회차 → 130회차에 API 밖으로 꺼냄).
 *
 * 계획이 스스로 쓴 기대치만으로는 못 잡는 것이 있다 — 49회차에 투구가 머리의 1.3% 로 쪼그라들었는데 검사는
 * 10개 다 통과했다(계획이 "붙어 있다" 만 적었으니까). 종류를 막론하고 이 회사가 늘 참이라고 보는 것을 여기서 잰다.
 *
 * **왜 꺼냈나(130회차)**: 124회차 자 감사가 "45번·22번·22번 재서 **한 번도 안 떨어진** 자" 다섯을 찾았다.
 * 이빨이 없는 건지, 아직 그 고장이 안 난 건지 가르려면 **고장을 일부러 넣어 잡는지 봐야 한다**(108회차 규칙).
 * API 라우트 안에 박혀 있으면 그걸 못 한다. 순수 함수로 꺼내니 `engine/tools/standing_checks_probe.mts` 가 잰다.
 * 로직은 그대로 옮겼다 — 문턱도 글도 안 바꿨다.
 */

export type Case = { name: string; result: "Passed" | "Failed" | "Inconclusive" | "Skipped" | string; message?: string | null };
export type Measures = Record<string, unknown>;

/** 회사가 늘 붙이는 줄. 계획이 뭘 적든 이 줄은 붙는다. */
export function standingChecks(m: Measures): Case[] {
  const out: Case[] = [];
  const num = (k: string) => (typeof m[k] === "number" ? (m[k] as number) : null);
  const parts = num("parts_attached") ?? 0;

  if (parts > 0) {
    const ratio = num("part_size_ratio");
    if (ratio != null) {
      // 59회차: 0.3~3.0 은 너무 헐거웠다. 사장님이 사진을 보고 "투구 크기 개판" 이라 했는데 자는 1.29 로 통과였다.
      // 몸에 얹는 것은 붙은 자리를 **덮되 삼키지 않는** 크기다. 0.8~1.8 로 좁힌다.
      const ok = ratio >= 0.8 && ratio <= 1.8;
      out.push({ name: "규격_조각_크기", result: ok ? "Passed" : "Failed", message: `조각이 붙은 자리 크기의 ${ratio.toFixed(2)}배 (0.8~1.8 이어야 한다 — 작으면 안 보이고 크면 삼킨다)` });
    }
    // 66회차: 규격표의 "조각은 삼각형 3,000 이하" 를 **재는 줄**. 09-09 실측: 산 투구가 30,356개(몸 전체 29,385 보다 많다).
    const ptri = num("part_triangles");
    if (ptri != null && ptri > 0) {
      const ok = ptri <= 3000 * Math.max(1, parts);
      out.push({ name: "규격_조각_삼각형", result: ok ? "Passed" : "Failed", message: `얹은 조각 ${parts}개의 삼각형 ${ptri.toLocaleString()} (조각당 3,000 이하 — 넘으면 블렌더로 줄인다)` });
    }
    const off = num("part_offset_ratio");
    if (off != null) {
      // 121회차: 규격표(머리 중심 = Head 뼈에서 8.4 cm 위 · 정수리 20.1 cm 위, headSize = 20.1)로 계산하면
      // 제대로 씌운 투구는 8.4/20.1 = 0.42 다. 옛 문턱 "0.35 이하" 는 제대로 씌운 것을 떨어뜨리고 가라앉힌 것을 통과시켰다.
      const CENTERED = 0.42, BAND = 0.15;
      const ok = Math.abs(off - CENTERED) <= BAND;
      const how = off < CENTERED - BAND ? "목덜미 쪽으로 가라앉았다" : "머리 위로 떠 있다";
      out.push({ name: "규격_조각_자리", result: ok ? "Passed" : "Failed", message: `조각 중심이 뼈에서 머리 크기의 ${off.toFixed(2)}배 위 (머리 중심 ${CENTERED} ±${BAND} 여야 한다)${ok ? "" : ` — ${how}`}` });
    }
    if (m.part_covers_bone === false) {
      out.push({ name: "규격_조각_감싸기", result: "Failed", message: "조각이 붙은 뼈를 감싸지 않는다 — 옆에 떠 있다" });
    }
  }

  // 57회차: **사람 비율.** 53회차에 파일 단위를 전부 바꿔 캐릭터가 100배가 됐을 때 검사는 다 통과했다 —
  // 이 줄이 있었으면 첫 판에 걸렸다. 넓게 잡는다(고양이·기사·마네킹이 다 산다). 여기 걸리면 비율이 아니라 **단위가 깨진 것**이다.
  const bodyH = num("body_height_m");
  if (bodyH != null) {
    const ok = bodyH >= 0.4 && bodyH <= 4;
    out.push({ name: "규격_사람_키", result: ok ? "Passed" : "Failed", message: `사람 캐릭터 키 ${bodyH.toFixed(2)} m (0.4~4.0 이어야 한다 — 벗어나면 비율이 아니라 파일 단위가 깨진 것이다)` });
  }
  const heads = num("head_count");
  if (heads != null) {
    const ok = heads >= 2 && heads <= 9;
    out.push({ name: "규격_등신", result: ok ? "Passed" : "Failed", message: `${heads.toFixed(1)} 등신 (2~9 여야 한다 — 리얼 7~8·스타일라이즈 5~6·데포르메 3)` });
  }
  return out;
}

/**
 * 계획이 쓴 기대치를 실측과 맞춰 본다. 재지 못하는 기대치는 **실패가 아니라 '못 잼'** 이다 —
 * 42회차(빈 범위) · 57회차(숫자 자에 참/거짓) · 119회차(폭 0) 가 모두 같은 자리다.
 */
export function expectationChecks(expectations: Expectation[], m: Measures): Case[] {
  const out: Case[] = [];
  for (const e of expectations) {
    const v = m[e.measure];
    const label = e.why ? `${e.why} (${e.measure})` : e.measure;
    if (v === undefined) { out.push({ name: `기대_${e.measure}`, result: "Inconclusive", message: `${label}: 자가 안 쟀다` }); continue; }
    if (isUnmeasurableRange(e)) {
      out.push({ name: `기대_${e.measure}`, result: "Inconclusive", message: `${label}: 실측 ${String(v)} — 기대 폭이 0(${e.min}~${e.max})이라 못 잰다. min·max 를 벌려야 잰다` });
      continue;
    }
    if (typeof e.equals === "boolean" && typeof v === "number") {
      out.push({ name: `기대_${e.measure}`, result: "Inconclusive", message: `${label}: 실측 ${String(v)} — 숫자를 재는 자에 참/거짓을 적었다. min·max 로 적어야 잰다` });
      continue;
    }
    let ok: boolean;
    if (typeof e.equals === "boolean") ok = v === e.equals;
    else if (e.min == null && e.max == null) {
      out.push({ name: `기대_${e.measure}`, result: "Inconclusive", message: `${label}: 실측 ${String(v)} — 기대 범위가 비어 있어 재지 못했다` });
      continue;
    } else { const n = Number(v); ok = Number.isFinite(n) && (e.min == null || n >= e.min) && (e.max == null || n <= e.max); }
    const range = typeof e.equals === "boolean" ? String(e.equals) : `${e.min ?? "-∞"}~${e.max ?? "∞"}`;
    out.push({ name: `기대_${e.measure}`, result: ok ? "Passed" : "Failed", message: `${label}: 실측 ${String(v)}, 기대 ${range}` });
  }
  return out;
}

/** 한쪽만 막힌 기대치인가(`3~∞`). 아래로만 떨어질 수 있으니 반쪽 자다 — 틀린 건 아니고 약한 것이다. */
export function isOneSided(e: Expectation): boolean {
  return typeof e.equals !== "boolean" && ((e.min == null) !== (e.max == null));
}
