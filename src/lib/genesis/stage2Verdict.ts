/**
 * **2단계 판정 — 판을 쌓기 전에 잠근다** (204회차 09-21, 사장님 지적 1·5).
 *
 * > *"끝 조건을 사람 고개로 두면, 결과를 보고 나서 통과를 정하는 그 실패로 돌아가요.
 * >  자는 단계 시작 전에 잠그고, 제 고개는 '다음 단계로 갈 가치가 있나' 만 정하는 걸로요."*
 * > *"판이 쌓이기 전에 '이 정도 차이면 best, 이 정도면 explore, 이 안이면 모름' 을 적어 두세요.
 * >  '모름' 도 결과로 인정해야 2단계가 안 늘어져요."*
 *
 * 그래서 이 파일이 **자**다. 사장님 고개는 자 뒤에 오고, 정하는 것은 *다음 단계로 갈 가치가 있나* 뿐이다.
 *
 * **표본이 작다는 것을 먼저 인정한다.** 각 5판이면 큰 차이만 보인다 — 통과율 차이 0.4(5판 중 2판)
 * 미만은 동전 던지기와 구별되지 않는다. 그래서 가운데 띠는 **모름**이고, 모름은 실패가 아니라 **결과**다.
 */

export type SeatTally = { best: { n: number; ok: number }; explore: { n: number; ok: number } };

/** 잠근 문턱. 판을 쌓기 전에 적는다. */
export const STAGE2 = {
  minN: 5,
  /** 통과율 차이가 이만큼은 나야 한쪽이 낫다고 말한다. 5판 기준 2판 차이. */
  band: 0.4,
} as const;

export type Stage2Verdict =
  | { kind: "못 잼"; why: string; need: { best: number; explore: number } }
  | { kind: "머리가 낫다" | "섞는 게 낫다" | "모름"; why: string; diff: number };

export function judgeStage2(t: SeatTally): Stage2Verdict {
  const need = { best: Math.max(0, STAGE2.minN - t.best.n), explore: Math.max(0, STAGE2.minN - t.explore.n) };
  if (need.best || need.explore) {
    return { kind: "못 잼", why: `표본이 모자란다 — best ${t.best.n}/${STAGE2.minN} · explore ${t.explore.n}/${STAGE2.minN}`, need };
  }
  const rb = t.best.ok / t.best.n, re = t.explore.ok / t.explore.n;
  const diff = rb - re;
  if (diff >= STAGE2.band) return { kind: "머리가 낫다", why: `머리가 고른 자리 통과율 ${(rb * 100).toFixed(0)}% vs 섞은 자리 ${(re * 100).toFixed(0)}%`, diff };
  if (diff <= -STAGE2.band) return { kind: "섞는 게 낫다", why: `섞은 자리 ${(re * 100).toFixed(0)}% vs 머리 ${(rb * 100).toFixed(0)}%`, diff };
  // **모름도 결과다.** 여기서 "판을 더 쌓자" 로 가면 2단계가 무한정 늘어진다(사장님).
  return { kind: "모름", why: `차이 ${(diff * 100).toFixed(0)}%p — 잠근 띠 ±${STAGE2.band * 100}%p 안이다. **이 표본으로는 구별 못 한다**는 것이 결과다`, diff };
}

/**
 * 2단계가 **끝났나**. 자는 여기까지만 말한다 —
 * 세 결과(머리가 낫다/섞는 게 낫다/모름) 중 하나가 나오면 **잰 것은 끝났다.**
 * 그 다음 *"3단계로 갈 가치가 있나"* 는 사장님 고개가 정한다(자가 정하지 않는다).
 */
export function stage2Done(v: Stage2Verdict): boolean {
  return v.kind !== "못 잼";
}
