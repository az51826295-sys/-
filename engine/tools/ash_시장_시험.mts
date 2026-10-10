/**
 * **시장과 자물쇠** (10-09 사장님 "일일 제한 상점"). 모델 0 · 값 0.
 *   ASH_URL=http://127.0.0.1:8124/ash/index.html npx tsx engine/tools/ash_시장_시험.mts [--sabotage]
 *
 * 이 자가 생긴 이유 — 내 자들이 전부 **재료를 심어 놓고** 쟀기 때문에 못 본 것이 있었다.
 * 실제로 1~9층만 돌면 금화 12,660 · 파편 158 · 잔혼 83 이 쌓이는데 **수호핵은 0** 이다.
 * 수호핵은 관문 보스만 떨구는데, 그 보스를 깨려면 수호핵이 든 철검이 필요했다.
 * **영영 못 만드는 자물쇠**였고, 심어 놓고 재는 자는 이것을 절대 못 본다.
 *
 * 그래서 이 자는 **아무것도 안 심는다.** 처음부터 돌려서 모인 것만으로 잰다.
 */
import { openHeadless } from "../../src/lib/video/headless";
import { 이름헬퍼 } from "./ash_공통.mjs";
const 주소 = process.env.ASH_URL ?? "https://rookery-web-production.up.railway.app/ash/index.html";
let 나쁨 = 0;
const 재기 = (n: string, ok: boolean, 본?: unknown) => { if (!ok) 나쁨++; console.log(ok ? "통과" : "실패", n, ok ? "" : JSON.stringify(본)); };

const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) process.exit(1);
try {
  const page = await 창.browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await 이름헬퍼(page);
  await page.goto(주소, { waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 1800));

  if (process.argv.includes("--sabotage")) await page.evaluate(() => {
    // 심은 고장: 하루 한도를 안 본다(= 돈만 있으면 무한히 사는 꼴)
    const w = window as any;
    w.사기 = (키: string) => { const m = w.매대[키]; if (w.S.금화 < m.값) return false;
      w.S.금화 -= m.값; if (키 === "약") w.S.가방.약++; else w.S.가방[키] = (w.S.가방[키] ?? 0) + 1; return true; };
  });

  const 본 = await page.evaluate(() => {
    const w = window as any;
    for (let i = 1; i < 9999; i++) clearInterval(i);
    try { localStorage.clear(); } catch { /* 없어도 된다 */ }

    /* ① **아무것도 안 심고** 1~9층을 실제로 돈다 */
    w.S.깸 = {}; w.S.보스깸 = []; w.S.금화 = 0; w.S.장날 = null; w.S.산것 = {};
    w.S.시장갈래 = "구매"; w.S.대장갈래 = "제작";   // 10-10: 갈래 카드를 한 번 지나야 안이 나온다
    Object.assign(w.S.가방, { 파편: 0, 잔혼: 0, 수호핵: 0 });
    w.S.가방.장비 = []; w.S.가방.약 = 0;
    w.S.자동오름 = true; w.S.층 = 1; w.S.사냥층 = 1; w.S.진행 = true; w.S.최고층 = w.열린층();
    w.전투준비(); w.적만들기();
    let t = 0;
    // **9층에서 멈춘다.** 10층에 발을 들이면 보스를 깨 버려 수호핵이 생기고, 자물쇠를 못 보게 된다.
    while (t < 300_000 && w.S.층 < 9) { w.한턴(); t++; }
    w.S.자동오름 = false;
    const 목표 = (w.S.깸[9] ?? 0) + 30;
    while (t < 600_000 && (w.S.깸[9] ?? 0) < 목표 && w.S.층 === 9) { w.한턴(); t++; }

    const 판뒤 = { 금화: w.S.금화, 수호핵: w.S.가방.수호핵, 철검모자람: w.모자람("철검") };

    /* ② 시장에서 모자란 것을 산다 */
    const 값 = w.매대.수호핵.값, 금화앞 = w.S.금화;
    const 샀나 = w.사기("수호핵");
    const 핵앞 = 판뒤.수호핵;
    const 산뒤 = { 금화: w.S.금화, 수호핵: w.S.가방.수호핵, 철검모자람: w.모자람("철검"),
                   금화줄었나: w.S.금화 === 금화앞 - 값, 핵늘었나: w.S.가방.수호핵 === 핵앞 + 1 };

    /* ③ 하루 한도 — 수호핵은 하루 한 개다 */
    w.S.금화 = 999999;
    const 또샀나 = w.사기("수호핵");
    const 남은 = w.남은수("수호핵");

    /* ④ 날이 바뀌면 다시 채워진다 */
    w.S.장날 = "2000-01-01";
    const 새날남은 = w.남은수("수호핵");

    /* ⑤ 금화가 모자라면 못 산다 */
    w.S.금화 = 10; w.S.장날 = null; w.S.산것 = {};
    const 돈없이 = w.사기("수호핵");

    /* ⑥ **자물쇠가 풀렸나** — 산 수호핵으로 철검이 실제로 만들어지는가 */
    w.S.금화 = 999999;
    const 만듦 = w.만들기("철검");
    const 템 = w.S.가방.장비[w.S.가방.장비.length - 1];

    return { 판뒤, 샀나, 산뒤, 또샀나, 남은, 새날남은, 돈없이, 만듦, 템있나: !!템, t };
  });

  console.log(`  1~9층만 돌고 나서 — 금화 ${본.판뒤.금화} · 수호핵 ${본.판뒤.수호핵} · 철검 모자람 ${JSON.stringify(본.판뒤.철검모자람)}`);
  console.log(`  시장에서 산 뒤  — 금화 ${본.산뒤.금화} · 수호핵 ${본.산뒤.수호핵} · 철검 모자람 ${JSON.stringify(본.산뒤.철검모자람)}`);

  // **이 자가 생긴 이유** — 심고 재는 자는 이 줄을 영원히 못 본다
  재기("1~9층만 돌면 수호핵이 안 나온다(자물쇠가 있다)", 본.판뒤.수호핵 === 0 && 본.판뒤.철검모자람.includes("수호핵"), 본.판뒤);
  재기("1~9층만 돌아도 금화는 넉넉하다", 본.판뒤.금화 >= 7000, 본.판뒤.금화);
  재기("시장에서 사면 금화가 줄고 재료가 는다", 본.샀나 === true && 본.산뒤.핵늘었나 && 본.산뒤.금화줄었나, 본.산뒤);
  재기("**자물쇠가 풀린다** — 사고 나면 철검을 만들 수 있다", 본.산뒤.철검모자람.length === 0, 본.산뒤.철검모자람);
  재기("산 재료로 장비가 실제로 만들어진다", 본.만듦 === true && 본.템있나, { 만듦: 본.만듦, 템: 본.템있나 });
  재기("하루 한도를 넘으면 못 산다", 본.또샀나 === false && 본.남은 === 0, { 또샀나: 본.또샀나, 남은: 본.남은 });
  재기("날이 바뀌면 다시 채워진다", 본.새날남은 === 1, 본.새날남은);
  재기("금화가 모자라면 못 산다", 본.돈없이 === false, 본.돈없이);
} finally { await 창.browser.close(); await 창.close?.(); }
console.log(나쁨 === 0 ? "전부 통과" : `실패 ${나쁨}건`);
process.exit(나쁨 === 0 ? 0 : 1);
