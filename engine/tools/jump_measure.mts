/**
 * **점프를 실제로 재는 자** (4단계 본판 판 1, 09-22).
 *
 * 사장님이 요청에 조건 하나를 못 박았다: *"최고 높이와 최대 거리는 지금과 같게 둡니다."*
 * 그래서 그 둘을 **재는 자를 회차 전에 만든다.** 상수(`jump: 13`, 중력 `0.62`)로 계산하지 않는다 —
 * 곡선을 바꾸면 중력이 구간마다 달라져 공식이 안 맞고, 그러면 **자가 대리값이 된다.**
 * 헤드리스 창에서 **정말로 뛰게 하고 프레임마다 위치를 읽는다.**
 *
 * 이 자는 두 칸을 같이 본다:
 * - **3번 칸의 난간** — 높이·거리가 변하면 안 된다(변하면 못 닿는 발판이 생긴다, 09-21 에 실제로 겪음)
 * - **2번 칸의 도움** — 상승·꼭대기·하강 프레임 수가 "쫀득함" 의 곡선이다. 다만 2번은 **사람 칸**이라
 *   이 숫자가 사장님의 "됐다" 를 대신하지 않는다.
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/jump_measure.mts <html경로> [--json]
 */
const { openHeadless } = await import("../../src/lib/video/headless");
const { readFileSync } = await import("node:fs");
const path = process.argv.find((a) => a.endsWith(".html"));
if (!path) { console.error("HTML 경로를 주세요"); process.exit(1); }
const html = readFileSync(path, "utf8");

const hl = await openHeadless({ width: 1280, height: 720 });
if (!hl) { console.error("브라우저가 없다"); process.exit(1); }
type Frame = { x: number; y: number; vy: number; g: boolean };
try {
  const page = await hl.browser.newPage();
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(String(e.message ?? e).slice(0, 120)));
  // 바깥은 없다 — 이 게임은 한 파일이다
  await page.setRequestInterception(true);
  page.on("request", (r) => { const u = r.url(); if (u.startsWith("data:") || u === "about:blank") void r.continue(); else void r.abort(); });
  await page.setContent(html, { waitUntil: "load" });
  await new Promise((r) => setTimeout(r, 600));

  /**
   * **함수가 아니라 문자열로 넘긴다.** `tsx`(esbuild)가 함수에 `__name` 헬퍼를 심어서
   * 함수를 그대로 넘기면 브라우저에서 `__name is not defined` 로 죽는다.
   * 그리고 `player` 는 최상위 `const` 라 `globalThis` 의 칸이 아니므로(전역 렉시컬 스코프)
   * **이름으로** 닿아야 한다 — 문자열 안에서는 그냥 이름으로 쓰면 된다.
   */
  const probe = async (holdRight: boolean): Promise<Frame[]> =>
    page.evaluate(`(async () => {
      for (let i = 0; i < 240 && !player.onGround; i++) await new Promise((r) => requestAnimationFrame(r));
      const rec = [];
      if (${holdRight}) keys.right = true;
      tryJump();
      await new Promise((res) => {
        const step = () => {
          rec.push({ x: player.x, y: player.y, vy: player.vy, g: player.onGround });
          if ((rec.length > 3 && player.onGround) || rec.length > 400) { keys.right = false; res(); return; }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      return rec;
    })()`) as Promise<Frame[]>;

  const up = await probe(false);
  const across = await probe(true);
  const read = (rec: Frame[]) => {
    const y0 = rec[0].y, x0 = rec[0].x;
    const peak = Math.min(...rec.map((f) => f.y));
    const peakAt = rec.findIndex((f) => f.y === peak);
    // 꼭대기 체류 = 꼭대기에서 1px 안에 머문 프레임 수
    const hang = rec.filter((f) => f.y - peak <= 1).length;
    const land = rec.findIndex((f, i) => i > 3 && f.g);
    const endI = land < 0 ? rec.length - 1 : land;
    return {
      높이: Math.round((y0 - peak) * 10) / 10,
      거리: Math.round((Math.max(...rec.map((f) => f.x)) - x0) * 10) / 10,
      상승프레임: peakAt, 꼭대기프레임: hang, 하강프레임: endI - peakAt, 전체프레임: endI,
    };
  };
  const a = read(up), b = read(across);
  const out = { 최고높이: a.높이, 최대거리: b.거리, 곡선: { 상승: a.상승프레임, 꼭대기: a.꼭대기프레임, 하강: a.하강프레임, 전체: a.전체프레임 }, 오류: errs };
  if (process.argv.includes("--json")) console.log(JSON.stringify(out));
  else {
    console.log(`재는 대상: ${path}`);
    console.log(`  **최고 높이 ${a.높이}px** · **최대 거리 ${b.거리}px**  ← 이 둘은 변하면 안 된다`);
    console.log(`  곡선: 상승 ${a.상승프레임}프레임 · 꼭대기 ${a.꼭대기프레임}프레임 · 하강 ${a.하강프레임}프레임 (전체 ${a.전체프레임})`);
    console.log(`  하강/상승 = ${(a.하강프레임 / Math.max(1, a.상승프레임)).toFixed(2)} (1보다 작아야 "내려올 때 더 빠르다")`);
    if (errs.length) console.log(`  오류: ${errs.join(" · ")}`);
  }
} finally { await hl.close(); }
