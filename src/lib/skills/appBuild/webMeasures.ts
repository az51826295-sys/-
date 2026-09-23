import type { Page } from "puppeteer-core";
import { playThrough } from "@/lib/skills/appBuild/playThrough";

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
  const size = { w: player.w, h: player.h, speed: player.speed };
  // 이 판의 발판 — 닿는지 따지려면 무대가 있어야 한다. 없으면 빈 배열(그러면 '못 잼').
  let plats = [];
  try { plats = stages.map((s) => s.platforms.map((p) => ({ x: p.x, y: p.y, w: p.w }))); } catch (e) { plats = []; }
  return { ground, rec, size, plats };
})()`;

/**
 * **올라가는 이동만 센다. 그리고 0 이 아니라 원본과 견준다** (사장님 09-22 + 09-22 자 고침).
 *
 * 처음엔 "공중 40프레임" 을 난간으로 뒀는데 사장님이 부딪치는 곳을 짚었다:
 * *"떨어지는 쪽을 빨리 만들면 공중 시간이 줄어드는데, 총 40프레임을 지키려면 그만큼을
 * 올라가는 쪽이나 꼭대기 머묾으로 채워야 합니다. … 쫀득함의 첫째 요소와 반대 방향입니다."*
 * 맞다. 공중 프레임은 **"가로 거리가 같다" 의 대리값**이었으므로 버리고 **닿는가를 직접 센다.**
 *
 * **그런데 첫 판은 자가 틀렸다.** 원본이 6쌍 "못 닿음" 으로 나왔다 — 사장님이 클리어하신 게임인데.
 * 못 닿는다던 쌍은 전부 **내려가는 이동**이었다. 잰 곡선은 *뛴 높이로 돌아올 때까지*라
 * 그 아래로 떨어지는 구간이 아예 없다. 자가 침묵한 게 아니라 **없는 것을 봤다.**
 *
 * 그래서 둘을 정했다:
 * 1. **올라가는(또는 같은 높이) 이동만 센다.** 내려가는 쪽은 이 곡선으로 판정할 수 없다 — 안 센다.
 * 2. **0 을 요구하지 않는다.** 원본에도 못 오르는 쌍이 하나 있다(무대1, 145px 오르막 — 그 길로
 *    가는 게 아닌 듯하다). 이 자는 **필요한 길을 모른다.** 그러니 절대값이 아니라
 *    **원본보다 나빠졌나**만 본다. 난간은 "원본의 개수 이하".
 *
 * 셈법: 가로는 이 게임에서 **즉시 등속**이다(`player.vx = player.speed`, 가속 없음).
 * 그래서 `dx(t) = speed × t` 이고, 세로는 잰 곡선 `dy(t)` 를 그대로 쓴다.
 */
function reach(ground: number, rec: Frame[], size: { w: number; h: number; speed: number }, plats: { x: number; y: number; w: number }[][]) {
  const dy = rec.map((f) => f.y - ground);
  let 오름 = 0, 못오름 = 0, 최소여유 = Infinity;
  for (const stage of plats) {
    const ps = [...stage].sort((a, b) => a.x - b.x);
    for (let i = 0; i + 1 < ps.length; i++) {
      const A = ps[i], B = ps[i + 1];
      if (B.y > A.y) continue;              // 내려가는 이동 — 이 곡선으로는 못 판정한다
      오름++;
      const x0 = A.x + A.w - size.w, yA = A.y - size.h;
      let ok = false, 여유: number | null = null;
      for (let t = 1; t < dy.length && !ok; t++) {
        const x = x0 + size.speed * t, y = yA + dy[t], yPrev = yA + dy[t - 1];
        if (x + size.w > B.x && x < B.x + B.w && yPrev + size.h <= B.y && y + size.h >= B.y) {
          ok = true;
          // **내려앉은 자리에서 발판 오른쪽 끝까지 남은 거리.** 09-22 에 뚫린 구멍이 여기였다 —
          // "닿는가" 만 보고 "지나치는가" 를 안 봤다. 판 6 은 이 값이 11.6 → 6.8px 로 줄었고
          // (가로 4.8px/프레임이니 **1.5프레임**), 기계는 통과시켰는데 사장님은 클리어를 못 하셨다.
          여유 = (B.x + B.w) - (x + size.w);
        }
      }
      if (!ok) 못오름++;
      if (여유 != null && 여유 < 최소여유) 최소여유 = 여유;
    }
  }
  return { 오름, 못오름, 최소여유: 최소여유 === Infinity ? null : Math.round(최소여유 * 10) / 10 };
}

export type JumpNumbers = {
  "점프.높이px": number;
  "점프.공중프레임": number;
  "점프.하강나누기상승": number;
  "점프.상승프레임": number;
  "점프.꼭대기프레임": number;
  "점프.하강프레임": number;
  /** 올라가는 이웃 발판 쌍 중 **못 오르는 개수**. 난간은 0 이 아니라 **원본의 값 이하**다. */
  "점프.못오르는발판": number;
  "점프.오르는발판쌍": number;
  /** 올라가는 이동들 중 **제일 빠듯한 착지 여유**(px). 작을수록 발판을 지나쳐 떨어지기 쉽다. */
  "점프.착지여유최소px"?: number;
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
    const up = (await page.evaluate(jumpProbeSource(false))) as
      { ground: number; rec: Frame[]; size: { w: number; h: number; speed: number }; plats: { x: number; y: number; w: number }[][] } | null;
    if (!up?.rec?.length) return null;
    if (!up.plats?.length || !up.size?.speed) return null;   // 무대를 못 읽으면 못 잼
    const a = read(up.ground, up.rec);
    const r = reach(up.ground, up.rec, up.size, up.plats);
    // 같은 높이로 돌아오지 않았으면 이 점프는 제자리 점프가 아니다 — 못 잼으로 둔다.
    if (a.착지높이차 !== 0) return null;
    return {
      "점프.높이px": a.높이,
      "점프.공중프레임": a.전체,
      "점프.하강나누기상승": Math.round((a.하강 / Math.max(1, a.상승)) * 100) / 100,
      "점프.상승프레임": a.상승,
      "점프.꼭대기프레임": a.꼭대기,
      "점프.하강프레임": a.하강,
      "점프.못오르는발판": r.못오름,
      "점프.오르는발판쌍": r.오름,
      ...(r.최소여유 == null ? {} : { "점프.착지여유최소px": r.최소여유 }),
    };
  } catch { return null; }
}

/**
 * **끝까지 해 보기** — 3번 칸(되던 것이 안 깨졌나)을 고리 안으로 (205회차 09-23).
 * 4단계 판 1~8 은 전부 깰 수 없는 원본 위에서 돌았고 아무 자도 몰랐다. 이 칸이 있었으면 첫 판에 잡혔다.
 * 조종할 이름이 없는 게임은 null → 난간이 '못 잼' 으로 건다(통과가 아니다).
 */
export async function measureClear(page: Page): Promise<Record<string, number> | null> {
  const r = await playThrough(page, 2500);
  if (r.끝 === "못 잼") return null;
  return { "게임.클리어": r.끝 === "클리어" ? 1 : 0, "게임.닿은무대": r.닿은무대, "게임.잃은목숨": r.잃은목숨 };
}

export const WEB_MEASURES: Record<string, (p: Page) => Promise<Record<string, number> | null>> = {
  점프: measureJump as (p: Page) => Promise<Record<string, number> | null>,
  게임: measureClear,
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
