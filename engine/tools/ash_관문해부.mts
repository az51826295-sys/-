/**
 * **이 관문에서 무슨 일이 벌어지나** (10-11). 모델 0 · 값 0.
 *   ASH_URL=... npx tsx engine/tools/ash_관문해부.mts [층=90]
 *
 * 10-11: T9(+7000)도 T10(+15400·체력 +52000)도 **똑같이 90층에서 죽었다.**
 * 체력을 2.2배 더 줘도 막히는 층이 같으면 그건 수치가 아니라 **기믹**이다.
 * 그래서 그 한 판만 떼어 놓고, 한 턴씩 숫자를 적는다.
 */
import { openHeadless } from "../../src/lib/video/headless";
import { 이름헬퍼 } from "./ash_공통.mjs";
const 주소 = process.env.ASH_URL ?? "https://rookery-web-production.up.railway.app/ash/index.html";
const 층 = Number(process.argv[2] ?? 90);
/** 둘째 인자 = 쓸 수 있는 레시피의 최대 열림. 티어를 하나씩 막아 보며 **어느 티어가 그 관문을 여는지** 본다. */
const 최대열림 = Number(process.argv[3] ?? 99);

const 창 = await openHeadless({ width: 390, height: 844, protocolTimeout: 10 * 60_000 });
if (!창) process.exit(1);
try {
  const page = await 창.browser.newPage();
  await 이름헬퍼(page);
  await page.goto(주소, { waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 1800));

  const 본 = await page.evaluate(([f, 최대열림]: number[]) => {
    const w = window as any;
    for (let i = 1; i < 9999; i++) clearInterval(i);
    w.requestAnimationFrame = () => 0;
    let 씨 = 20261011; Math.random = () => { 씨 = (씨 * 1103515245 + 12345) & 0x7fffffff; return 씨 / 0x7fffffff; };

    // 제일 좋은 장비를 전부 끼운다 — 재료·금화는 넉넉히
    w.S.금화 = 1e12;
    for (const k of Object.keys(w.재료이름)) w.S.가방[k] = 99999;
    w.S.최고층 = f; w.S.층 = f; w.S.사냥층 = f;
    const 값 = (k: string) => Object.values(w.레시피[k].효과 ?? {}).reduce((a: number, b: any) => a + Number(b), 0);
    for (const 슬롯 of ["무기", "갑옷"]) {
      const 고를 = Object.keys(w.레시피).filter((k) => w.레시피[k].슬롯 === 슬롯 && w.레시피[k].열림 <= 최대열림 && !w.모자람(k).length)
        .sort((a, b) => 값(b) - 값(a))[0];
      for (const c of w.S.대원) if (w.만들기(고를)) {
        const t = w.S.가방.장비[w.S.가방.장비.length - 1]; w.장착(t.id, c.id);
      }
    }
    for (const c of w.S.대원) c.레벨 = w.레벨상한(c);
    w.S.진행 = true; w.전투준비(); w.적만들기(0);

    const 아 = w.S.대원.filter((c: any) => w.S.파티.includes(c.id));
    const 처음 = {
      아군: 아.map((c: any) => ({ 이름: c.이름, 레벨: c.레벨, 체력: w.최대체력(c), 공격: w.공격력(c), 방어: w.방어력(c) })),
      적: (w.적들 ?? []).map((e: any) => ({ 이름: e.이름, hp: e.최대, 공격: Math.round(e.공격), 방어: e.방어, 보호막: e.보호막 })),
    };

    /* 한 턴씩 돌리며 **보호막이 벗겨지는지**와 양쪽이 깎이는 속도를 본다 */
    const 자취: any[] = [];
    let 턴 = 0;
    const 적0 = () => (w.적들 ?? [])[0];
    while (턴 < 60_000 && 적0() && w.산아군().length) {
      w.한턴(); 턴++;
      const e = 적0();
      if (!e) break;
      if (턴 % 2000 === 0) 자취.push({
        턴, 보스hp: Math.round(Math.max(0, e.hp) / e.최대 * 100), 보호막: e.보호막,
        아군: 아.map((c: any) => Math.round(Math.max(0, c.hp) / w.최대체력(c) * 100)),
      });
    }
    const e = 적0();
    return { 처음, 자취, 턴, 끝: {
      보스남음: e ? Math.round(Math.max(0, e.hp) / e.최대 * 100) : 0,
      보호막남음: e ? e.보호막 : null,
      산아군: w.산아군().length, 전멸: !w.산아군().length,
    } };
  }, [층, 최대열림]);

  console.log(`${층}층 (열림 ${최대열림} 까지) — 아군`);
  for (const c of 본.처음.아군) console.log(`  ${c.이름.padEnd(6)} Lv.${String(c.레벨).padStart(3)} 체력 ${String(c.체력).padStart(7)} 공격 ${String(c.공격).padStart(6)} 방어 ${String(c.방어).padStart(5)}`);
  console.log(`${층}층 — 적`);
  for (const e of 본.처음.적) console.log(`  ${e.이름.padEnd(10)} hp ${String(e.hp).padStart(9)} 공격 ${String(e.공격).padStart(7)} 방어 ${String(e.방어).padStart(5)} 보호막 ${e.보호막}`);

  const a = 본.처음.아군, b = 본.처음.적[0];
  if (b) {
    const 때림 = a.reduce((s: number, c: any) => s + w결(c.공격, b.방어), 0);
    const 맞음 = w결(b.공격, a[0]?.방어 ?? 0);
    console.log(`\n  한 턴에 우리가 넣는 피해 ≈ ${Math.round(때림)} → 보스를 눕히는 데 **${Math.ceil(b.hp / Math.max(1, 때림))}턴**`);
    console.log(`  한 대 맞을 때 ≈ ${Math.round(맞음)} → 앞사람이 쓰러지는 데 **${Math.ceil(a[0].체력 / Math.max(1, 맞음))}대**`);
    console.log(`  보호막 ${b.보호막} — 벗기려면 기사 궁 ${Math.ceil(b.보호막 / 25)}번(그동안 우리 공격은 전부 튕긴다)`);
  }
  console.log(`\n  ${본.턴}턴 뒤 — 보스 ${본.끝.보스남음}% · 보호막 ${본.끝.보호막남음} · 산 아군 ${본.끝.산아군}${본.끝.전멸 ? " (전멸)" : ""}`);
  for (const t of 본.자취) console.log(`   ${String(t.턴).padStart(6)}턴 · 보스 ${String(t.보스hp).padStart(3)}% · 막 ${String(t.보호막).padStart(3)} · 아군 ${t.아군.join("/")}`);
} finally { await 창.browser.close(); await 창.close?.(); }

/** 방어 뒤 피해 — 게임의 식과 같다(원 × 100/(100+방어)) */
function w결(원: number, 방어: number){ return 원 * 100 / (100 + 방어); }
