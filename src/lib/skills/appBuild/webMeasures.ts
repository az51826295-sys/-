import type { Page } from "puppeteer-core";

/**
 * **웹 판을 숫자로 재는 자** (205회차 09-22, 사장님이 ㉮를 고르심).
 *
 * 왜 생겼나: 4단계 본판 판 2 가 *"점프를 더 쫀득하게"* 를 고치다 **최고 높이를 36% 떨어뜨렸다.**
 * 고리 심판은 화면만 보므로 점프 높이가 안 보였고, 스스로 *"점프 물리는 확인할 수 없습니다"* 라고 적었다.
 * 숫자 기대치(`expectations`)는 **유니티 전용**이고 웹 판에서는 코드가 명시적으로 버리고 있었다.
 * 그래서 로키는 **요청의 핵심 숫자를 못 보고** 고쳤다.
 *
 * **자는 하나여야 한다.** 내 손의 자(`engine/tools/jump_measure.mts`)와 고리의 자가 갈리면
 * 또 두 숫자가 생긴다 — 그래서 재는 코드는 여기 한 곳에 두고 양쪽이 같이 쓴다.
 *
 * **못 재면 '통과' 가 아니라 '못 잼'이다.** 이름을 못 찾으면 `null` 을 돌려주고,
 * 난간은 "못 쟀다" 로 걸린다. 조용히 통과시키지 않는다.
 */

export type WebGuard = { measure: string; min?: number | null; max?: number | null; why?: string };
type Frame = { x: number; y: number; vy: number; g: boolean };

/**
 * 게임 틱에 맞춰 한 번 뛰고 프레임마다 위치를 읽는다.
 *
 * - `draw` 를 감싼다: 최상위 `function` 선언이라 덮어쓸 수 있고 `update()` **뒤에** 불린다.
 *   `requestAnimationFrame` 으로 찍으면 표본이 업데이트보다 먼저 돌아 **착지 스냅 전의 초과분**을 읽는다
 *   (09-22 에 그 12.4px 짜리 거짓 값이 그대로 주문서의 "절대 바꾸지 말 것" 이 됐다).
 * - 땅 높이는 **점프 전**에 찍는다. 착지한 y 로 잡으면 착지 높이차가 정의상 늘 0 이라 검사가 빈 껍데기가 된다.
 */
export const jumpProbeSource = (holdRight: boolean) => `(async () => {
  if (typeof player === "undefined" || typeof draw !== "function" || typeof tryJump !== "function") return null;
  let calm = 0;
  for (let i = 0; i < 300 && calm < 5; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    calm = (player.onGround && Math.abs(player.vy) < 0.001) ? calm + 1 : 0;
  }
  if (calm < 5) return null;
  const ground = player.y;
  const rec = [];
  const origDraw = draw;
  await new Promise((res) => {
    draw = function () {
      origDraw();
      rec.push({ x: player.x, y: player.y, vy: player.vy, g: player.onGround });
      if ((rec.length > 3 && player.onGround) || rec.length > 400) { if (typeof keys === "object") keys.right = false; draw = origDraw; res(); }
    };
    if (${holdRight} && typeof keys === "object") keys.right = true;
    tryJump();
  });
  return { ground, rec };
})()`;

export type JumpNumbers = {
  "점프.높이px": number;
  "점프.공중프레임": number;
  "점프.하강나누기상승": number;
  "점프.상승프레임": number;
  "점프.꼭대기프레임": number;
  "점프.하강프레임": number;
};

function read(ground: number, rec: Frame[]) {
  const peak = Math.min(...rec.map((f) => f.y));
  const peakAt = rec.findIndex((f) => f.y === peak);
  const hang = rec.filter((f) => f.y - peak <= 1).length;
  const landIdx = rec.findIndex((f, i) => i > 3 && f.g);
  const endI = landIdx < 0 ? rec.length - 1 : landIdx;
  return {
    높이: Math.round((ground - peak) * 10) / 10,
    상승: peakAt, 꼭대기: hang, 하강: endI - peakAt, 전체: endI,
    착지높이차: Math.round(((landIdx < 0 ? rec[rec.length - 1] : rec[landIdx]).y - ground) * 10) / 10,
  };
}

/** 점프 숫자. 이 게임이 `player`·`draw`·`tryJump` 를 안 쓰면 **못 잰다**(null). */
export async function measureJump(page: Page): Promise<JumpNumbers | null> {
  try {
    const up = (await page.evaluate(jumpProbeSource(false))) as { ground: number; rec: Frame[] } | null;
    if (!up?.rec?.length) return null;
    const a = read(up.ground, up.rec);
    // 같은 높이로 돌아오지 않았으면 이 점프는 제자리 점프가 아니다 — 못 잼으로 둔다.
    if (a.착지높이차 !== 0) return null;
    return {
      "점프.높이px": a.높이,
      "점프.공중프레임": a.전체,
      "점프.하강나누기상승": Math.round((a.하강 / Math.max(1, a.상승)) * 100) / 100,
      "점프.상승프레임": a.상승,
      "점프.꼭대기프레임": a.꼭대기,
      "점프.하강프레임": a.하강,
    };
  } catch { return null; }
}

export const WEB_MEASURES: Record<string, (p: Page) => Promise<Record<string, number> | null>> = {
  점프: measureJump as (p: Page) => Promise<Record<string, number> | null>,
};

/** 이름들을 재서 한 장으로 합친다. 못 잰 묶음은 아예 안 들어간다(0 이 아니다). */
export async function measureWeb(page: Page, names: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const n of names) {
    const fn = WEB_MEASURES[n];
    if (!fn) continue;
    const got = await fn(page);
    if (got) Object.assign(out, got);
  }
  return out;
}

/** 어떤 묶음을 재야 하는지 — 난간이 쓰는 이름에서 거꾸로 뽑는다. */
export function measureNamesFor(guards: WebGuard[]): string[] {
  return [...new Set(guards.map((g) => g.measure.split(".")[0]).filter((n) => n in WEB_MEASURES))];
}

/**
 * 난간을 대 본다. **어긴 것과 못 잰 것 둘 다 돌려준다** — 못 잰 것을 통과로 돌리지 않는다.
 * 돌려주는 문장은 그대로 고리의 `broken` 에 들어가고, 그러면 고치는 자리도 이 문장을 본다.
 */
export function checkGuards(measured: Record<string, number> | undefined, guards: WebGuard[]): string[] {
  const out: string[] = [];
  for (const g of guards) {
    const v = measured?.[g.measure];
    if (v == null) { out.push(`난간 못 잼: ${g.measure} — 값을 못 읽었다(통과가 아니다)`); continue; }
    const why = g.why ? ` (${g.why})` : "";
    if (g.min != null && v < g.min) out.push(`난간 어김: ${g.measure} = ${v} · ${g.min} 이상이어야 한다${why}`);
    else if (g.max != null && v > g.max) out.push(`난간 어김: ${g.measure} = ${v} · ${g.max} 이하여야 한다${why}`);
  }
  return out;
}
