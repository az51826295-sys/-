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
   * **게임 틱에 맞춰 찍는다** (09-22 에 자를 고친 자리).
   * 처음엔 `requestAnimationFrame` 으로 찍었는데 **내 표본이 게임 업데이트보다 먼저** 돌아서,
   * 착지 프레임에서 스냅 전의 초과분(12.4px)을 읽었다. 그 12.4px 짜리 거짓 값을
   * 그대로 주문에 실어 보냈고, 고침은 **내 틀린 숫자를 충실히 구현했다.**
   * 그래서 `draw` 를 감싼다 — `draw` 는 최상위 `function` 선언이라 전역 객체의 칸이고(덮어쓸 수 있다),
   * `update()` 다음에 불리므로 **업데이트가 끝난 상태**가 찍힌다.
   *
   * 함수가 아니라 문자열로 넘기는 이유: `tsx`(esbuild)가 `__name` 헬퍼를 심어 함수는 브라우저에서 죽는다.
   * `player` 는 최상위 `const` 라 globalThis 의 칸이 아니고 이름으로만 닿는다.
   */
  const probe = async (holdRight: boolean): Promise<{ ground: number; rec: Frame[] }> =>
    page.evaluate(`(async () => {
      // 땅에 가만히 서 있을 때까지 — 5틱 연속 onGround 이고 vy 0
      let calm = 0;
      for (let i = 0; i < 300 && calm < 5; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        calm = (player.onGround && Math.abs(player.vy) < 0.001) ? calm + 1 : 0;
      }
      // **점프 전 땅 높이를 따로 찍는다.** 앞서 땅 높이를 "착지한 y" 로 잡았더니
      // 착지 높이차가 정의상 늘 0 이 되어 검사가 빈 껍데기가 됐다(09-22).
      const ground = player.y;
      const rec = [];
      const origDraw = draw;
      await new Promise((res) => {
        draw = function () {
          origDraw();
          rec.push({ x: player.x, y: player.y, vy: player.vy, g: player.onGround });
          if ((rec.length > 3 && player.onGround) || rec.length > 400) { keys.right = false; draw = origDraw; res(); }
        };
        if (${holdRight}) keys.right = true;
        tryJump();
      });
      return { ground, rec };
    })()`) as Promise<{ ground: number; rec: Frame[] }>;

  const up = await probe(false);
  const across = await probe(true);
  const read = ({ ground, rec }: { ground: number; rec: Frame[] }) => {
    // 땅 높이는 **점프 전**에 찍은 값이다(착지 y 로 잡으면 검사가 빈 껍데기가 된다).
    const x0 = rec[0].x, y0 = ground;
    const landIdx = rec.findIndex((f, i) => i > 3 && f.g);
    const peak = Math.min(...rec.map((f) => f.y));
    const peakAt = rec.findIndex((f) => f.y === peak);
    // 꼭대기 체류 = 꼭대기에서 1px 안에 머문 프레임 수
    const hang = rec.filter((f) => f.y - peak <= 1).length;
    const land = rec.findIndex((f, i) => i > 3 && f.g);
    const endI = land < 0 ? rec.length - 1 : land;
    return {
      높이: Math.round((y0 - peak) * 10) / 10,
      // **착지 높이가 다르면 거리를 견줄 수 없다.** 곡선을 바꾼 뒤 앞 발판을 넘어가
      // 더 낮은 곳에 떨어지면 공중 시간이 길어져 거리가 저절로 늘어난다 —
      // 그걸 "거리가 변했다" 로 읽으면 자가 엉뚱한 것을 재는 것이다(09-22).
      착지높이차: Math.round(((landIdx < 0 ? rec[rec.length - 1] : rec[landIdx]).y - y0) * 10) / 10,
      거리: Math.round((Math.max(...rec.map((f) => f.x)) - x0) * 10) / 10,
      상승프레임: peakAt, 꼭대기프레임: hang, 하강프레임: endI - peakAt, 전체프레임: endI,
    };
  };
  const a = read(up), b = read(across);
  const out = { 최고높이: a.높이, 최대거리: b.거리, 곡선: { 상승: a.상승프레임, 꼭대기: a.꼭대기프레임, 하강: a.하강프레임, 전체: a.전체프레임 },
    거리판: { 전체프레임: b.전체프레임, 착지높이차: b.착지높이차, 견줄수있나: b.착지높이차 === 0 }, 제자리판착지높이차: a.착지높이차, 오류: errs };
  if (process.argv.includes("--json")) console.log(JSON.stringify(out));
  else {
    console.log(`재는 대상: ${path}`);
    console.log(`  **최고 높이 ${a.높이}px** · **최대 거리 ${b.거리}px**  ← 이 둘은 변하면 안 된다`);
    console.log(`  곡선: 상승 ${a.상승프레임}프레임 · 꼭대기 ${a.꼭대기프레임}프레임 · 하강 ${a.하강프레임}프레임 (전체 ${a.전체프레임})`);
    console.log(`  하강/상승 = ${(a.하강프레임 / Math.max(1, a.상승프레임)).toFixed(2)} (1보다 작아야 "내려올 때 더 빠르다")`);
    console.log(`  거리를 잰 판: 공중 ${b.전체프레임}프레임 · 착지 높이차 ${b.착지높이차}px · ${b.착지높이차 === 0 ? "같은 높이에 떨어짐 → 견줄 수 있다" : "**다른 높이에 떨어졌다 → 거리는 못 견준다**"}`);
    console.log(`  제자리 판 착지 높이차 ${a.착지높이차}px`);
    if (errs.length) console.log(`  오류: ${errs.join(" · ")}`);
  }
} finally { await hl.close(); }
