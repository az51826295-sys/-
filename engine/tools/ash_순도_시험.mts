/**
 * **1층 수직 한 조각이 끝까지 도는가** (10-09 사장님 "얻는 재료가 지금 너무 대충이야"). 모델 0 · 값 0.
 *   ASH_URL=http://127.0.0.1:8124/ash/index.html npx tsx engine/tools/ash_순도_시험.mts [--sabotage]
 *
 * 재는 것 — 설계서가 말한 심장 고리를 **한 바퀴 전부**:
 *   떨어진다(순도 붙어서) → 쌓인다(묶음) → 정제한다(3→1) → 장비를 만든다(순도가 능력치에 곱해짐)
 *   → **불순물의 흠이 전투에 실제로 먹는다**
 *
 * 마지막 칸이 제일 중요하다. 순도가 숫자로만 예쁘고 전투에 안 닿으면 아무것도 아니다.
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
    // 심은 고장: 순도를 장비 능력치에 안 곱한다(= 숫자만 예쁘고 전투엔 안 닿는 꼴)
    const w = window as any, 원 = w.만들면;
    w.만들면 = (키: string) => { const v = 원(키); v.효과 = { ...w.레시피[키].효과 }; v.흠 = {}; return v; };
  });

  const 본 = await page.evaluate(() => {
    const w = window as any;
    for (let i = 1; i < 9999; i++) clearInterval(i);
    try { localStorage.clear(); } catch { /* 없어도 된다 */ }
    w.S.가방.재료 = []; w.S.가방.장비 = []; w.S.깸 = {}; w.S.보스깸 = []; w.S.자동오름 = false;
    w.S.최고층 = w.열린층();

    /* ① 1층을 열 판 돌려서 **실제로 떨어지는 것**을 본다 */
    w.S.층 = 1; w.S.사냥층 = 1; w.S.진행 = true; w.S.쉼 = 0;
    w.전투준비(); w.적만들기();
    let 턴 = 0;
    while ((w.S.깸?.[1] ?? 0) < 10 && 턴 < 60_000) { w.한턴(); 턴++; }
    const 떨어진 = Object.keys(w.재료표).map((k) => ({ 키: k, 개: w.재료합(k) }));
    const 묶음 = w.S.가방.재료.map((x: any) => ({ 키: x.키, 순도: x.순도, 불순: x.불순, 수: x.수 }));
    const 순도들 = 묶음.map((x: any) => x.순도);

    /* ② 정제 — 가장 나쁜 셋이 녹고, 결과가 그보다 좋아야 한다 */
    w.S.가방.재료 = [];
    w.재료넣기("철조각", 30, 40, 1); w.재료넣기("철조각", 40, 30, 1); w.재료넣기("철조각", 50, 20, 1);
    w.재료넣기("철조각", 90, 10, 1);                        // 좋은 것 하나 — 이건 안 녹아야 한다
    const 정제결과 = w.정제("철조각");
    const 정제뒤 = w.S.가방.재료.filter((x: any) => x.키 === "철조각").map((x: any) => ({ 순도: x.순도, 불순: x.불순, 수: x.수 }));

    /* ③ 장비 — 같은 레시피를 **나쁜 재료**와 **좋은 재료**로 각각 만들어 견준다 */
    const 하나만들기 = (순: number, 불: number) => {
      w.S.가방.재료 = []; w.S.가방.장비 = []; w.S.금화 = 99999; w.S.최고층 = 10;
      for (const [k, n] of Object.entries(w.레시피.철검.재료) as [string, number][]) w.재료넣기(k, 순, 불, n);
      const 볼 = w.만들면("철검");
      const 됐나 = w.만들기("철검");
      return { 됐나, 볼, 템: w.S.가방.장비[0] };
    };
    const 똥 = 하나만들기(30, 50);
    const 명품 = 하나만들기(90, 0);

    /* ④ **전투에 닿는가** — 흠이 속도를 깎고, 받는 피해를 늘리는가 */
    const c = w.S.대원[0];
    w.S.가방.재료 = []; w.S.가방.장비 = []; w.S.금화 = 99999;
    const 맨몸 = { 공격: w.공격력(c), 속도: w.속도(c) };
    하나만들기(30, 50);                                      // 흠 많은 철검
    w.장착(w.S.가방.장비[0].id, c.id);
    const 똥낀뒤 = { 공격: w.공격력(c), 속도: w.속도(c), 흠속도: w.흠몫(c, "속도") };
    w.S.가방.장비 = [];
    하나만들기(90, 0);                                       // 흠 없는 철검
    w.장착(w.S.가방.장비[0].id, c.id);
    const 명품낀뒤 = { 공격: w.공격력(c), 속도: w.속도(c), 흠속도: w.흠몫(c, "속도") };

    return { 턴, 떨어진, 묶음, 순도들, 정제결과, 정제뒤, 똥, 명품, 맨몸, 똥낀뒤, 명품낀뒤 };
  });

  console.log(`  1층 10판(${본.턴}턴) → ${본.떨어진.map((d: any) => `${d.키} ${d.개}`).join(" · ")}`);
  console.log(`  묶음 ${본.묶음.length}가지 · 순도 ${Math.min(...본.순도들)}~${Math.max(...본.순도들)}%`);
  console.log(`  철검 — 똥(순도 ${본.똥.볼.순도}%): 공격 +${본.똥.볼.효과.공격} · 명품(순도 ${본.명품.볼.순도}%): 공격 +${본.명품.볼.효과.공격}`);
  console.log(`  속도 — 맨몸 ${본.맨몸.속도} · 똥 낀 뒤 ${본.똥낀뒤.속도} · 명품 낀 뒤 ${본.명품낀뒤.속도}`);

  재기("1층에서 재료가 떨어진다", 본.떨어진.every((d: any) => d.개 > 0), 본.떨어진);
  재기("떨어진 것마다 순도가 다르다", new Set(본.순도들).size >= 3, 본.순도들);
  재기("순도가 30~90 안에 있다", 본.순도들.every((n: number) => n >= 30 && n <= 90), 본.순도들);
  재기("같은 순도끼리 묶인다", 본.묶음.some((x: any) => x.수 > 1) || 본.묶음.length < 본.떨어진.reduce((a: number, d: any) => a + d.개, 0), 본.묶음.length);

  재기("정제가 3개를 1개로 만든다", !!본.정제결과 && 본.정제뒤.reduce((a: any, x: any) => a + x.수, 0) === 2, 본.정제뒤);
  재기("정제하면 순도가 오르고 불순이 준다",
    !!본.정제결과 && 본.정제결과.뒤.순도 > 본.정제결과.앞.순도 && 본.정제결과.뒤.불순 < 본.정제결과.앞.불순, 본.정제결과);
  // **좋은 것은 안 녹아야 한다** — 녹으면 모으는 의미가 사라진다
  재기("정제는 좋은 것을 안 건드린다", 본.정제뒤.some((x: any) => x.순도 === 90), 본.정제뒤);

  재기("장비가 만들어진다", 본.똥.됐나 === true && 본.명품.됐나 === true, { 똥: 본.똥.됐나, 명품: 본.명품.됐나 });
  // **이 자의 심장** — 순도가 능력치에 실제로 곱해지는가
  재기("순도가 높으면 능력치가 높다", 본.명품.볼.효과.공격 > 본.똥.볼.효과.공격, { 똥: 본.똥.볼.효과, 명품: 본.명품.볼.효과 });
  재기("보여 준 예측과 만든 결과가 같다",
    JSON.stringify(본.명품.템.효과) === JSON.stringify(본.명품.볼.효과), { 예측: 본.명품.볼.효과, 실제: 본.명품.템.효과 });

  재기("장비를 끼면 공격이 오른다", 본.명품낀뒤.공격 > 본.맨몸.공격, 본);
  // **불순물이 전투에 닿는가** — 여기가 안 되면 순도는 예쁜 숫자일 뿐이다
  재기("불순물이 속도를 깎는다", 본.똥낀뒤.속도 < 본.맨몸.속도 && 본.똥낀뒤.흠속도 < 0, { 맨몸: 본.맨몸.속도, 똥: 본.똥낀뒤 });
  재기("깨끗한 장비는 속도를 안 깎는다", 본.명품낀뒤.속도 === 본.맨몸.속도, { 맨몸: 본.맨몸.속도, 명품: 본.명품낀뒤 });
} finally { await 창.browser.close(); await 창.close?.(); }
console.log(나쁨 === 0 ? "\n전부 통과" : `\n실패 ${나쁨}건`);
process.exit(나쁨 === 0 ? 0 : 1);
