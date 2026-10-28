/**
 * **때린 순간이 보이나** (10-29). 모델 0 · 값 0.
 *   ASH_URL=... npx tsx engine/tools/ash_손맛.mts
 *   ASH_SABOTAGE=1 …   손맛을 **끈다**(자가 눈이 있나 본다)
 *
 * 10-28 설계서가 "조잡하고 밋밋한 숫자 교환" 이라고 했다. 빛(알갱이)은 이미 있었는데
 * **때린 순간이 없었다** — 맞아도 화면이 가만히 있고 맞은 쪽이 아무 반응을 안 했다.
 *
 * ## 그림을 재지, 변수를 믿지 않는다
 *
 * `흔x` 가 0이 아니라고 화면이 흔들리는 것은 아니다(그 값을 그리기가 안 쓸 수도 있다).
 * 그래서 **캔버스 픽셀**을 틀마다 떠서 잰다:
 *   · 번쩍 — 밝기가 튀는 틀이 있나
 *   · 흔들림 — 앞 틀과 **같은 그림이 몇 픽셀 밀려 있나**(밀어 보고 제일 잘 맞는 자리를 찾는다)
 *   · 히트스톱 — 그림이 **멈춰 있는** 틀이 이어지나
 *
 * 사보타주로 눈을 확인한다: 손맛을 끄면 셋 다 0이 나와야 한다.
 *
 * ## 한 번만 돌리지 말 것
 *
 * 흔들림은 0.12초만 간다. 150틀을 뜨는 동안 **때리는 일이 몇 번 들어오느냐**가 운이라
 * 배포판 네 번 중 한 번은 1틀만 잡혔다(나머지는 4~6틀). 통과/실패를 한 판으로 적지 말고
 * **세 번 돌려서** 본다([[measure-once-hides-variance]]).
 */
import { openHeadless } from "../../src/lib/video/headless";
import { 이름헬퍼 } from "./ash_공통.mjs";

const 주소 = process.env.ASH_URL ?? "https://rookery-web-production.up.railway.app/ash/index.html";
const 사보타주 = process.env.ASH_SABOTAGE === "1";

const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) process.exit(1);
try {
  const page = await 창.browser.newPage();
  await 이름헬퍼(page);
  const 오류: string[] = [];
  page.on("pageerror", (e) => 오류.push(String(e).slice(0, 140)));
  await page.goto(주소, { waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 2000));

  const 본 = await page.evaluate(async (끄기: boolean) => {
    const w = window as unknown as Record<string, any>;
    if (끄기) {
      /* 손맛만 꺼서 **자가 그걸 보고 있었는지** 가린다. 숫자는 그대로다. */
      /* 10-29: 처음엔 `w.멈춤 = 0` 으로 끄려 했는데 그 값들이 모듈 안 let 이라 **아무 일도
         안 일어났다** — 사보타주가 통째로 헛돌아 "눈이 있다" 는 거짓 확인을 줄 뻔했다.
         게임이 내준 스위치를 쓴다. */
      w.__손맛끄기 = true;
    }
    const cv = document.getElementById("cv") as HTMLCanvasElement;
    if (!cv) return { 못잼: "판(canvas)이 없다" };

    /* 싸움판을 연다. 게임이 스스로 도는 고리는 그대로 두고 **판만 펴서** 그리게 한다 —
       손으로 적을 세우면 죽은 게임도 통과한다([[ash-rulers-must-not-seed]]). */
    /* 첫 화면은 길드홀이다. 탑 탭("run")으로 가야 판이 펴진다 — 10-29 에 판 크기 0 으로
       한 번 헛돌았다. 화면을 짐작하지 말고 **그 게임이 쓰는 스위치**를 쓴다(S.탭). */
    w.S.탭 = "run";
    if (w.다시그리기) w.다시그리기(); else if (w.새로그리기) w.새로그리기();
    document.getElementById("battle")?.classList.add("on");
    document.getElementById("board")?.classList.remove("접음");
    document.getElementById("맵")?.classList.remove("on");
    await new Promise((r) => setTimeout(r, 800));
    /* 판 크기는 `크기()` 가 정한다. 창이 안 바뀌면 안 불리므로 **직접 부른다** —
       부르지 않고 "0 이다" 로 끝내면 고장이 아닌 것을 고장으로 적는다. */
    if (w.크기) w.크기();
    else window.dispatchEvent(new Event("resize"));
    if (w.그리기) w.그리기();
    await new Promise((r) => setTimeout(r, 400));
    if (!cv.width || !cv.height) return { 못잼: `판 크기가 0 이다 (${cv.width}x${cv.height}) · board ${Math.round(document.getElementById("board")!.getBoundingClientRect().width)}px` };
    w.S.층 = 1; w.S.진행 = true;
    if (w.전투준비) w.전투준비();
    if (w.적만들기) w.적만들기();
    /* 턴을 꾸준히 돌린다 — 때리는 일이 있어야 손맛이 날 수 있다. */
    const 턴고리 = setInterval(() => { try { w.한턴(); } catch { /* 전멸 등 */ } }, 120);
    await new Promise((r) => setTimeout(r, 600));

    const 작 = document.createElement("canvas");
    const sw = Math.min(200, cv.width - 40), sh = Math.min(120, cv.height - 20);
    /* 사람은 **판 아래쪽**에 선다(발 = 높이-14). 가운데를 자르면 캐릭터를 통째로 비껴간다 —
       10-29 에 그렇게 해서 번쩍이 0틀로 나왔다. 아래 띠를 자른다. */
    const 잘라x = Math.max(0, Math.round((cv.width - sw) / 2)), 잘라y = Math.max(0, cv.height - sh);
    작.width = sw; 작.height = sh;
    const x2 = 작.getContext("2d", { willReadFrequently: true })!;
    const 틀: { 밝기: number; 픽셀: Uint8ClampedArray }[] = [];
    for (let i = 0; i < 150; i++) {
      x2.clearRect(0, 0, sw, sh);
      /* **줄이지 않는다.** 10-29 에 390px 를 96px 로 줄여 떴더니 5px 흔들림이 1px 미만이 돼
         "0틀" 로 나왔다 — 자가 신호를 자기 손으로 뭉갰다. 가운데를 1:1 로 잘라 온다. */
      x2.drawImage(cv, 잘라x, 잘라y, sw, sh, 0, 0, sw, sh);
      const d = x2.getImageData(0, 0, sw, sh).data;
      let 합 = 0;
      for (let j = 0; j < d.length; j += 4) 합 += d[j] + d[j + 1] + d[j + 2];
      틀.push({ 밝기: 합 / (d.length / 4) / 3, 픽셀: new Uint8ClampedArray(d) });
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }

    /* 두 틀의 차이. dx 만큼 밀어서 비교한다 — 제일 작게 나오는 dx 가 밀린 양이다. */
    /**
     * 두 틀의 차이. dx 만큼 밀어서 비교한다 — 제일 작게 나오는 dx 가 밀린 양이다.
     *
     * **밋밋한 자리는 안 센다.** 배경이 거의 단색이라 거기까지 세면 밀어도 값이 안 변하고,
     * 사람 그림(화면의 일부)이 움직인 것이 묻힌다 — 10-29 에 이것 때문에 "흔들림 0틀" 이
     * 나왔다. 옆 픽셀과 **차이가 큰 자리**(윤곽)만 센다.
     */
    const 차 = (a: Uint8ClampedArray, b: Uint8ClampedArray, dx: number) => {
      let s = 0, n = 0;
      for (let y = 8; y < sh - 8; y++) for (let x = 10; x < sw - 10; x++) {
        const i = (y * sw + x) * 4;
        const 옆 = (y * sw + (x + 1)) * 4;
        const 날 = Math.abs(a[i] - a[옆]) + Math.abs(a[i + 1] - a[옆 + 1]) + Math.abs(a[i + 2] - a[옆 + 2]);
        if (날 < 36) continue;                       // 밋밋한 자리 — 밀어도 안 보인다
        const j = (y * sw + (x + dx)) * 4;
        s += Math.abs(a[i] - b[j]) + Math.abs(a[i + 1] - b[j + 1]) + Math.abs(a[i + 2] - b[j + 2]); n += 3;
      }
      return n ? s / n : 0;
    };

    let 번쩍틀 = 0, 밀린틀 = 0, 멈춘틀 = 0, 최대밀림 = 0;
    const 밝기들 = 틀.map((f) => f.밝기);
    const 보통 = 밝기들.slice().sort((a, b) => a - b)[Math.floor(밝기들.length / 2)];
    for (let i = 1; i < 틀.length; i++) {
      if (틀[i].밝기 > 보통 * 1.08 + 1) 번쩍틀++;
      const 같음 = 차(틀[i].픽셀, 틀[i - 1].픽셀, 0);
      if (같음 < 0.6) { 멈춘틀++; continue; }          // 거의 같은 틀 = 멈춰 있었다
      let 좋은dx = 0, 좋은값 = 같음;
      for (const dx of [-8, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 8]) {
        const v = 차(틀[i].픽셀, 틀[i - 1].픽셀, dx);
        if (v < 좋은값 * 0.8) { 좋은값 = v; 좋은dx = dx; }
      }
      if (좋은dx !== 0) { 밀린틀++; 최대밀림 = Math.max(최대밀림, Math.abs(좋은dx)); }
    }
    clearInterval(턴고리);
    const 셈 = (window as any).__손맛 ?? {};
    return { 셈, 틀수: 틀.length, 번쩍틀, 밀린틀, 멈춘틀, 최대밀림, 보통밝기: Math.round(보통 * 10) / 10 };
  }, 사보타주);

  if ((본 as Record<string, unknown>).못잼) { console.log("못 잼:", (본 as Record<string, unknown>).못잼); process.exit(2); }
  const b = 본 as { 틀수: number; 번쩍틀: number; 밀린틀: number; 멈춘틀: number; 최대밀림: number; 보통밝기: number };
  console.log(`틀 ${b.틀수}장 · 보통 밝기 ${b.보통밝기}`);
  console.log(`번쩍(밝기 튐)   ${b.번쩍틀}틀`);
  console.log(`흔들림(밀린 틀) ${b.밀린틀}틀 · 가장 많이 ${b.최대밀림}px`);
  console.log(`히트스톱(멈춘 틀) ${b.멈춘틀}틀`);
  console.log(`(게임이 센 것) ${JSON.stringify((본 as Record<string, unknown>).셈)}`);
  if (오류.length) console.log("\n페이지 오류:", [...new Set(오류)].slice(0, 3).join(" | "));

  /* **둘 다 있어야 통과다.** 그림만 보면 알갱이(섬광)가 밝혀 놓은 것을 번쩍으로 세고,
     멈춘 틀은 "안 다시 그린 틀" 과 구별이 안 된다 — 사보타주에서 둘 다 그냥 통과했다.
     그림은 "화면까지 갔나" 를, 게임 셈은 "그 길로 간 게 맞나" 를 말한다. */
  const 셈 = ((본 as Record<string, unknown>).셈 ?? {}) as { 흔든틀?: number; 번쩍틀?: number; 멈춘틀?: number };
  const 판정: [string, boolean][] = [
    ["맞을 때 번쩍인다", b.번쩍틀 >= 2 && (셈.번쩍틀 ?? 0) >= 2],
    ["화면이 흔들린다", b.밀린틀 >= 2 && (셈.흔든틀 ?? 0) >= 2],
    ["멈추는 틀이 있다", b.멈춘틀 >= 2 && (셈.멈춘틀 ?? 0) >= 2],
  ];
  let 나쁨 = 0;
  console.log("");
  for (const [n, ok] of 판정) { if (!ok) 나쁨++; console.log(`${ok ? "맞음  " : "어긋남"} ${n}`); }
  if (사보타주) console.log("\n사보타주: 어긋남이 0 이면 **자가 손맛을 안 보고 있다**.");
  process.exit(나쁨 === 0 ? 0 : 1);
} finally {
  await 창.browser.close().catch(() => {});
}
