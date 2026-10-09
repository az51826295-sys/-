/**
 * **막히는가** (10-09 사장님 "장비 제작의 필요성"). 모델 0 · 값 0.
 *   ASH_URL=http://127.0.0.1:8124/ash/index.html npx tsx engine/tools/ash_막힘_시험.mts [끝층=25]
 *
 * 이 게임의 고리는 `전투 → 재료 → 대장간 → 장비 → 더 높은 층` 인데,
 * **맨 끝 화살표가 끊겨 있었다** — 30층까지 한 대도 안 맞아서 앞의 셋이 전부 장식이었다.
 *
 * 그래서 **막힘** 하나만 잰다. 그리고 반드시 **대조군과 같이** 잰다:
 *   · 맨몸으로 올라가면 **어디서 막히나**  ← 막혀야 한다
 *   · 장비를 끼고 가면 **그 층을 넘나**     ← 넘어야 한다
 * 하나만 보면 "뭐든 모자라다"가 통과해 버린다(09-22 사장님 교훈).
 *
 * 게임 안의 한턴() 을 그대로 돌린다 — 따로 셈을 베끼면 게임과 다른 것을 재게 된다.
 */
import { openHeadless } from "../../src/lib/video/headless";
import { 이름헬퍼 } from "./ash_공통.mjs";

const 주소 = process.env.ASH_URL ?? "https://rookery-web-production.up.railway.app/ash/index.html";
const 끝층 = Number(process.argv[2] ?? 25);

type 한판 = { 층: number; 깸: number; 전멸: number; 턴: number; 체력: number; 레벨: number; 공격: number };

const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) process.exit(1);
try {
  const page = await 창.browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await 이름헬퍼(page);
  await page.goto(주소, { waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 1800));

  const 본 = await page.evaluate((끝층: number) => {
    const w = window as any;
    for (let i = 1; i < 9999; i++) clearInterval(i);
    try { localStorage.clear(); } catch { /* 없어도 된다 */ }

    const 오르기 = (장비끼고: boolean, 최대열림 = 99) => {
      // 처음부터 다시 — 대원·가방·층을 전부 비운다(앞 판의 레벨이 묻으면 대조군이 안 된다)
      w.S.대원.length = 0; w.S.파티.length = 0;
      for (const k of ["기사", "검사", "회복술사"]) w.S.대원.push(w.대원만들기(k));
      w.S.파티 = w.S.대원.map((c: any) => c.id);
      w.S.대표 = w.S.대원[0].id;
      w.S.가방.장비 = []; w.S.가방.약 = 0; w.S.약챙김 = false;
      w.S.깸 = {}; w.S.보스깸 = []; w.S.금화 = 0;
      Object.assign(w.S.가방, { 파편: 0, 잔혼: 0, 수호핵: 0 });
      w.S.층 = 1; w.S.단계 = 1; w.S.사냥층 = 1; w.S.자동오름 = true; w.S.쉼 = 0;
      w.S.최고층 = w.열린층(); w.S.진행 = true;
      w.전투준비(); w.적만들기();

      const 길: Array<{ 층: number; 깸: number; 전멸: number; 턴: number; 체력: number; 레벨: number; 공격: number }> = [];
      let 턴 = 0, 층턴 = 0, 앞층 = 1, 전멸 = 0, 막힌층 = 0, 층전멸 = 0, 최고닿은 = 1;
      const 체력 = () => {
        const p = w.S.대원.filter((c: any) => w.S.파티.includes(c.id));
        return Math.round(p.reduce((a: number, c: any) => a + Math.max(0, c.hp) / w.최대체력(c), 0) / p.length * 100);
      };
      const 꾸미기 = () => {
        /* 그 층에서 만들 수 있는 것 중 **슬롯마다 가장 좋은 것**을 끼운다.
           빈 칸만 채우면 철검을 낀 채로 대검을 영영 안 들게 돼 T2 를 못 재게 된다.
           재료·금화는 넉넉히 준다 — 이 자는 "장비가 있으면 넘는가"를 보는 자다.
           **재료를 못 구해 막히는 것**(자물쇠)은 ash_시장_시험.mts 가 따로 본다. */
        if (!장비끼고) return;
        w.S.금화 = 9999999; Object.assign(w.S.가방, { 파편: 9999, 잔혼: 9999, 수호핵: 999, 가죽: 9999 });
        const 값 = (k: string) => Object.values(w.레시피[k].효과 ?? {}).reduce((a: number, b: any) => a + Number(b), 0);
        for (const 슬롯 of ["무기", "갑옷"]) {
          const 고를 = Object.keys(w.레시피)
            .filter((k) => w.레시피[k].슬롯 === 슬롯 && w.레시피[k].열림 <= 최대열림 && !w.모자람(k).length)
            .sort((a, b) => 값(b) - 값(a))[0];
          if (!고를) continue;
          for (const c of w.S.대원) {
            const 낀 = w.S.가방.장비.find((x: any) => x.누구 === c.id && w.레시피[x.키].슬롯 === 슬롯);
            if (낀 && 낀.키 === 고를) continue;
            if (w.만들기(고를)) { const t = w.S.가방.장비[w.S.가방.장비.length - 1]; w.장착(t.id, c.id); }
          }
        }
      };

      let 최저 = 100;
      while (턴 < 400_000) {
        const 쉼앞 = w.S.쉼;
        w.한턴(); 턴++; 층턴++;
        // **전투 중**에 재야 한다. 판이 끝난 뒤엔 전투준비()가 이미 체력을 꽉 채워서 늘 100%로 보인다.
        if (!w.S.쉼) 최저 = Math.min(최저, 체력());
        if (w.S.쉼 > 쉼앞) { 전멸++; 층전멸++; }
        if (w.S.층 !== 앞층) {
          길.push({ 층: 앞층, 깸: w.S.깸[앞층] ?? 0, 전멸: 층전멸, 턴: 층턴, 체력: 최저,
                    레벨: w.S.대원[0]?.레벨 ?? 0, 공격: w.공격력(w.S.대원[0]) });
          앞층 = w.S.층; 층턴 = 0; 층전멸 = 0; 최저 = 100;
          꾸미기();                                   // 새 층에 들어설 때마다 만들 수 있는 걸 만든다
          if (w.S.층 > 끝층) break;
        }
        /* **막혔다**의 신호 둘 — 게임이 10-09부터 관문 패배를 스스로 처리한다:
           ① 관문에서 져서 자동 등반이 꺼지고 아래층으로 밀려났다
           ② 같은 층에서 세 번 전멸(관문이 아닌 곳에서 막힌 경우) */
        if (!w.S.자동오름) { 막힌층 = 최고닿은; break; }
        if (층전멸 >= 3) { 막힌층 = w.S.층; break; }
        최고닿은 = Math.max(최고닿은, w.S.층);
      }
      return { 길, 전멸, 막힌층, 닿은층: 최고닿은, 턴 };
    };

    /* 셋을 나란히 잰다 — **T1 만으로 20층을 넘어 버리면 T2 를 만들 이유가 없다.**
       그 줄은 "장비를 끼면 넘는다" 하나만 봐서는 절대 안 보인다. */
    return { 맨몸: 오르기(false), T1: 오르기(true, 5), 장비: 오르기(true) };
  }, 끝층);

  for (const 이름 of ["맨몸", "T1", "장비"] as const) {
    const r = (본 as any)[이름];
    console.log(`\n── ${이름} ──  닿은 층 ${r.닿은층} · 전멸 ${r.전멸}번${r.막힌층 ? ` · **${r.막힌층}층에서 막힘**` : " · 안 막힘"}`);
    console.log("   층   깸   전멸   턴   최저체력   레벨   공격");
    for (const x of r.길 as 한판[]) if (x.층 % 5 === 0 || x.층 === 1 || x.층 % 10 === 0)
      console.log(`  ${String(x.층).padStart(3)} ${String(x.깸).padStart(4)} ${String(x.전멸).padStart(5)} ${String(x.턴).padStart(5)} ${`${x.체력}%`.padStart(9)} ${String(x.레벨).padStart(6)} ${String(x.공격).padStart(6)}`);
  }
  /* ── 판정 ───────────────────────────────────────────────────
     **둘 다** 성립해야 고리가 이어진 것이다. 하나만 보면
     "뭐든 모자라다"가 통과해 버린다(09-22 사장님 교훈). */
  let 나쁨 = 0;
  const 재기 = (n: string, ok: boolean, 본?: unknown) => { if (!ok) 나쁨++; console.log((ok ? "통과" : "실패"), n, ok ? "" : JSON.stringify(본)); };
  const 맨 = 본.맨몸 as any, 티1 = (본 as any).T1, 장 = 본.장비 as any;
  // 첫 벽은 **10층**이어야 한다(사장님 10-09). 20층이면 너무 늦어서, 그때까지 정비 없이 오토만 돈다.
  재기("맨몸은 첫 관문(10층)에서 막힌다", 맨.막힌층 === 10, { 막힌층: 맨.막힌층, 닿은층: 맨.닿은층 });
  재기("T1 을 끼면 첫 관문을 넘는다", 티1.닿은층 > 맨.막힌층, { 맨몸: 맨.막힌층, T1: 티1.닿은층 });
  // **T1 만으로 20층까지 가면 T2 가 장식이 된다** — 다음 관문이 다음 장비를 요구해야 고리가 한 바퀴 더 돈다
  재기("T1 만으로는 둘째 관문(20층)에서 막힌다", 티1.막힌층 === 20, { 막힌층: 티1.막힌층, 닿은층: 티1.닿은층 });
  재기("T2 를 끼면 둘째 관문을 넘는다", 장.닿은층 > 20, { T1: 티1.막힌층, T2: 장.닿은층 });
  재기("초반(1~9층)은 안 막힌다", (맨.길 as 한판[]).filter((x) => x.층 < 10).every((x) => x.전멸 === 0),
    (맨.길 as 한판[]).filter((x) => x.층 < 10).map((x) => [x.층, x.전멸]));
  // 레벨이 층을 앞지르면 되돌이를 돌수록 쉬워진다(10-09 실측: 25층에서 Lv.64였다)
  재기("레벨이 층을 크게 앞지르지 않는다", (장.길 as 한판[]).every((x) => x.레벨 <= x.층 + 4),
    (장.길 as 한판[]).map((x) => [x.층, x.레벨]).slice(-5));
  console.log(나쁨 === 0 ? "전부 통과" : `실패 ${나쁨}건`);
  if (나쁨) process.exitCode = 1;
} finally { await 창.browser.close(); await 창.close?.(); }
