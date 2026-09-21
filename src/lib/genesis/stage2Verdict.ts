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
  | { kind: "머리가 낫다" | "섞는 게 낫다" | "모름"; why: string; diff: number; /** 띄 밖이어도 **증명이 아니다** — 잠정이다. */ strength: "잠정" | "모름" };

export function judgeStage2(t: SeatTally): Stage2Verdict {
  const need = { best: Math.max(0, STAGE2.minN - t.best.n), explore: Math.max(0, STAGE2.minN - t.explore.n) };
  if (need.best || need.explore) {
    return { kind: "못 잼", why: `표본이 모자란다 — best ${t.best.n}/${STAGE2.minN} · explore ${t.explore.n}/${STAGE2.minN}`, need };
  }
  const rb = t.best.ok / t.best.n, re = t.explore.ok / t.explore.n;
  const diff = rb - re;
  // **띄 밖이어도 증명은 아니다** (사장님 09-21): *"다섯 판씩이면 4/5 대 1/5 도 우연으로 꾰 나와요.
  //  띄 밖 결과는 '당분간 이쪽으로 보낸다' 정도의 **잠정 판정**으로 적어 두세요. 되돌리기 싼 결정이라 그걸로 충분해요."*
  if (diff >= STAGE2.band) return { kind: "머리가 낫다", why: `머리가 고른 자리 ${(rb * 100).toFixed(0)}% vs 섞은 자리 ${(re * 100).toFixed(0)}% — **잠정**이다(다섯 판씩은 우연으로도 나온다). 당분간 이쪽으로 보낸다`, diff, strength: "잠정" };
  if (diff <= -STAGE2.band) return { kind: "섞는 게 낫다", why: `섞은 자리 ${(re * 100).toFixed(0)}% vs 머리 ${(rb * 100).toFixed(0)}% — **잠정**이다. 당분간 이쪽으로 보낸다`, diff, strength: "잠정" };
  // **모름도 결과다.** 여기서 "판을 더 쌓자" 로 가면 2단계가 무한정 늘어진다(사장님).
  return { kind: "모름", why: `차이 ${(diff * 100).toFixed(0)}%p — 잠근 띠 ±${STAGE2.band * 100}%p 안이다. **이 표본으로는 구별 못 한다**는 것이 결과다`, diff, strength: "모름" };
}

/**
 * 2단계가 **끝났나**. 자는 여기까지만 말한다 —
 * 세 결과(머리가 낫다/섞는 게 낫다/모름) 중 하나가 나오면 **잰 것은 끝났다.**
 * 그 다음 *"3단계로 갈 가치가 있나"* 는 사장님 고개가 정한다(자가 정하지 않는다).
 */
export function stage2Done(v: Stage2Verdict): boolean {
  return v.kind !== "못 잼";
}

/**
 * **고치는 판의 재료를 어디서 얻나** — 기준과 **같이** 잠근다 (사장님 09-21).
 *
 * > *"사장님이 요청을 써야 하면 그게 주말 시간을 먹고, 로키가 자기 산출물에 스스로 요청을 만들면
 * >  쉬운 것만 고르게 될 수 있어요. 요청을 어떻게 만들지도 기준과 같이 잠가 두라고 하세요."*
 *
 * 그래서 요청은 **미리 얼린 목록**에서 나온다. 로키가 그때그때 짓지 않는다.
 * - 대상 산출물은 **만든 순서대로** 고른다(고르기에 재량을 안 준다 — 쉬운 것만 집는 것을 막는다).
 * - 요청 문장은 아래 네 갈래에서 **돌아가며** 쓴다. 갈래마다 난이도가 다르다.
 * - 자리는 섞어 보내기가 정한다. **사람도 나도 자리를 안 고른다.**
 */
export const FIX_KINDS = [
  { kind: "눈에 보이는 것", ask: "시작 화면에 '남은 시간' 을 큰 글씨로 띄워 줘.", 난이도: "쉬움" },
  { kind: "규칙 하나", ask: "점수가 10점 넘으면 속도가 1.5배가 되게 해 줘.", 난이도: "보통" },
  { kind: "고장 고치기", ask: "화면 끝에서 조작이 안 먹는 것 같아. 끝까지 움직이게 고쳐 줘.", 난이도: "어려움" },
  { kind: "되돌리기", ask: "방금 바꾼 걸 되돌리고, 대신 색만 어둡게 해 줘.", 난이도: "보통" },
] as const;

/**
 * **이 시험이 "모름" 말고 다른 답을 낼 수 있나** (204회차 09-21, 사장님).
 *
 * > *"이 시험은 설계상 거의 항상 '모름' 이 나오게 되어 있었어요. 한쪽이 5판이면 통과율이 20%p 단위로만
 * >  움직이고, ±40%p 띠를 넘으려면 90% 대 40% 같은 큰 차이가 나야 해요. 그러니 이번 결과는
 * >  '둘이 비슷하다' 는 증거가 아니라 **'이 크기의 시험으로는 원래 말할 수 없었다'** 예요."*
 *
 * 그래서 **잠그기 전에** 묻는다: *그럴듯한 차이가 진짜로 있을 때, 이 시험이 그걸 잡아낼 확률은 얼마인가.*
 * 낮으면 판 수를 늘리든지 시험을 미룬다. 자가 값을 내는 것만으로는 부족하다 — **말할 수 있어야** 한다.
 *
 * 이항분포로 **정확히** 센다(표본이 작아 다 세도 금방이다).
 *
 * **넣자마자 내 가정을 뒤집었다** (09-21): 나는 "판을 늘리면 된다" 고 적었는데, 띄를 40%p 로 둔 채
 * 각 30판으로 늘리면 힘이 24% → **5%** 로 떨어진다. 판이 많아질수록 관측된 차이가 참값 근처로 모여서
 * **띄를 넘길 일이 줄기** 때문이다. 즉 이 시험이 무엇을 잡는지를 정하는 것은 **판 수가 아니라 띄**다.
 * 20%p 를 잡으려면 띄를 같이 좁혀야 하고, 띄를 좁히면 거짓 양성이 늘어 판이 더 필요하다.
 */
export function detectPower(trueBest: number, trueExplore: number, nBest: number, nExplore: number, band: number = STAGE2.band): number {
  const C = (n: number, k: number) => { let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return r; };
  const pmf = (n: number, p: number) => Array.from({ length: n + 1 }, (_, k) => C(n, k) * p ** k * (1 - p) ** (n - k));
  const pb = pmf(nBest, trueBest), pe = pmf(nExplore, trueExplore);
  let hit = 0;
  for (let b = 0; b <= nBest; b++) for (let e = 0; e <= nExplore; e++) {
    if (Math.abs(b / nBest - e / nExplore) >= band) hit += pb[b] * pe[e];
  }
  return hit;
}
