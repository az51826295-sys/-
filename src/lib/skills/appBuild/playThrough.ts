import type { Page } from "puppeteer-core";

/**
 * **게임을 진짜로 끝까지 해 보는 기계** (205회차 09-23).
 *
 * 왜 생겼나: 4단계에서 **3번 칸(되던 것이 안 깨졌나)이 사람 칸**이었다.
 * 판 6·7·8 이 전부 거기서 깨졌고, 그때마다 사장님이 직접 해 보셔야 알았다:
 * *"클리어가 안돼"* · *"높이가 높아서 클리어가 안돼"*.
 * 기계가 잰 숫자는 매번 *"원본과 같다"* 였다 — 자가 한 칸 모자랐다.
 *
 * **클리어는 취향이 아니다.** 깨지거나 안 깨지거나다. 그래서 이 칸은 기계로 넘길 수 있다.
 * (2번 칸 *"쫀득한가"* 는 다르다 — 판 7 에서 기계는 높이가 원본보다 **낮다**는 걸 정확히 보고도
 *  사장님은 *"높다"* 고 하셨다. 거기서 모자란 것은 눈이 아니라 **무엇을 좋다고 할지**였다.)
 *
 * **조종은 단순하게**: 오른쪽으로 가다가 막히거나 앞이 낭떠러지면 뛴다.
 * 사람처럼 잘 하려 들지 않는다 — **원본을 깰 수 있을 만큼만** 하면 된다.
 * 자가 원본을 못 깨면 그건 게임 탓이 아니라 **조종이 서툰 것**이고, 그 자로는 아무것도 못 잰다.
 */

export type PlayResult = {
  /** "클리어" = 끝까지 갔다 · "죽음" = 목숨을 다 잃었다 · "못 감" = 시간 안에 아무 데도 못 갔다 · "못 잼" = 이 게임을 조종할 수 없다 */
  끝: "클리어" | "죽음" | "못 감" | "못 잼";
  닿은무대: number;
  잃은목숨: number;
  걸린틱: number;
  why?: string;
};

/**
 * `player`·`keys`·`tryJump`·`stages`·`mode` 를 쓰는 판만 조종할 수 있다(별빛 플랫포머 꼴).
 * 이름을 못 찾으면 **'못 잼'** 이다 — '실패' 가 아니다. 안 재 것을 실패로 세지 않는다.
 */
export const playProbeSource = (maxTicks: number, lookahead = 24) => `(async () => {
  if (typeof player === "undefined" || typeof keys !== "object" || typeof tryJump !== "function"
      || typeof stages === "undefined" || typeof draw !== "function") return { 끝: "못 잼", why: "조종할 이름이 없다" };
  if (typeof newGame === "function") newGame();
  let ticks = 0, best = 0, deaths = 0, lastLives = (typeof lives === "number" ? lives : 3);
  const origDraw = draw;
  const done = await new Promise((res) => {
    draw = function () {
      origDraw();
      ticks++;
      if (stageIndex > best) best = stageIndex;
      if (typeof lives === "number" && lives < lastLives) { deaths++; lastLives = lives; }
      // **조종**: 늘 오른쪽. 앞이 막혔거나(가로 속도가 죽었거나) 발밑이 비면 뛴다.
      keys.right = true;
      const s = stages[stageIndex];
      const 발밑 = s.platforms.some((p) =>
        player.x + player.w > p.x && player.x < p.x + p.w &&
        Math.abs((player.y + player.h) - p.y) < 3);
      const 앞이빔 = !s.platforms.some((p) =>
        player.x + player.w + ${lookahead} > p.x && player.x + ${lookahead} < p.x + p.w &&
        p.y >= player.y + player.h - 2 && p.y <= player.y + player.h + 90);
      const 막힘 = Math.abs(player.vx) < 0.4 && player.onGround;
      if (player.onGround && (앞이빔 || 막힘 || !발밑)) tryJump();
      if (mode !== "playing" || ticks >= ${maxTicks}) { keys.right = false; draw = origDraw; res(mode); }
    };
  });
  return { 끝: done === "clear" ? "클리어" : done === "gameover" ? "죽음" : "못 감",
           닿은무대: best + 1, 잃은목숨: deaths, 걸린틱: ticks };
})()`;

/**
 * **뛰는 자리를 여러 개 시도한다.** 사람도 한 번에 안 되면 다시 한다.
 * 어느 하나라도 깨면 "깰 수 있는 길이 있다" 다. 제일 멀리 간 시도를 돌려준다.
 * (앞 lookahead px 이 비면 뛴다 — 작을수록 낭떠러지 끝에서 뛰어 가로 거리를 다 쓴다.)
 */
export async function playThrough(page: Page, maxTicks = 3000): Promise<PlayResult & { 시도: number; 뛴자리px?: number }> {
  const 자리들 = [4, 10, 18, 28, 40];
  let best: (PlayResult & { 시도: number; 뛴자리px?: number }) | null = null;
  for (let i = 0; i < 자리들.length; i++) {
    let r: PlayResult;
    try {
      const raw = (await page.evaluate(playProbeSource(maxTicks, 자리들[i]))) as PlayResult | null;
      r = raw ? { ...raw, 닿은무대: raw.닿은무대 ?? 0, 잃은목숨: raw.잃은목숨 ?? 0, 걸린틱: raw.걸린틱 ?? 0 }
              : { 끝: "못 잼", 닿은무대: 0, 잃은목숨: 0, 걸린틱: 0, why: "아무것도 안 돌아왔다" };
    } catch (e) { r = { 끝: "못 잼", 닿은무대: 0, 잃은목숨: 0, 걸린틱: 0, why: e instanceof Error ? e.message.slice(0, 120) : String(e) }; }
    const cur = { ...r, 시도: i + 1, 뛴자리px: 자리들[i] };
    if (r.끝 === "못 잼") return cur;                       // 조종할 수 없는 게임 — 더 해 봐야 소용없다
    if (!best || r.끝 === "클리어" || (best.끝 !== "클리어" && r.닿은무대 > best.닿은무대)) best = cur;
    if (r.끝 === "클리어") break;
  }
  return best!;
}
