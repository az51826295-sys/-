/**
 * **기술이 글로만 있는 게 아니라 실제로 도는가** (10-10 사장님 명세). 모델 0 · 값 0.
 *   ASH_URL=http://127.0.0.1:8124/ash/index.html npx tsx engine/tools/ash_기술_시험.mts [--sabotage]
 *
 * 기술을 도감에 적어 넣는 것과 **전투에서 불리는 것**은 다르다. 쿨이 안 돌거나 `쓸까`가
 * 늘 거짓이면 기술은 영영 안 나오는데, 카드 창에는 멀쩡히 보인다 — 사람이 속기 딱 좋다.
 * 그래서 이 자는 글을 안 보고 **전투를 돌려서 효과가 났는지**만 본다.
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
    // 심은 고장: 스킬을 아예 안 고른다(= 도감엔 적혀 있는데 전투에선 안 나오는 꼴)
    const w = window as any;
    for (const k of Object.keys(w.도감)) delete w.도감[k].스킬;
  });

  const 본 = await page.evaluate(() => {
    const w = window as any;
    for (let i = 1; i < 9999; i++) clearInterval(i);
    try { localStorage.clear(); } catch { /* 없어도 된다 */ }

    /* 네 명 다 세우고 오래 싸우게 한다 — 쿨이 긴 기술(처형 4턴)이 나올 틈을 준다 */
    w.S.대원.length = 0; w.S.파티.length = 0;
    for (const k of ["기사", "검사", "회복술사", "흑마법사"]) w.S.대원.push(w.대원만들기(k, 20));
    w.S.파티 = w.S.대원.map((c: any) => c.id);
    w.S.최고층 = 20; w.S.층 = 20; w.S.단계 = 2; w.S.사냥층 = 20; w.S.진행 = true; w.S.쉼 = 0;
    w.S.가방.장비 = []; w.S.약챙김 = false;
    w.전투준비(); w.적만들기();

    const 본글: string[] = [];
    const 원장면 = w.적기;
    // 전투 글을 그대로 모은다(화면에 쓰이는 것과 같은 글이라 따로 베끼지 않는다)
    const 칸 = document.querySelector("#log")!;
    let 독봄 = false, 방어썩음봄 = 0, 연속봄 = false, 전체회복봄 = false, 치명봄 = false, 처형봄 = false, 벼름봄 = false;
    let 결의앞 = 0;
    const 결의뒤 = 0;

    const 검 = w.S.대원.find((c: any) => c.키 === "검사");
    결의앞 = w.공격력(검);
    /* **결의는 전투 전에 잰다.** 전투 뒤에 재면 이미 다친 상태라 "풀피"가 풀피가 아니다(10-10 자가 여기서 틀렸다). */
    const 배앞 = w.결의배(검);                       // 이때 검사는 풀피다
    검.hp = Math.max(1, Math.floor(w.최대체력(검) * .1));
    const 배뒤 = w.결의배(검);
    검.hp = w.최대체력(검);                           // 되돌려 놓고 전투를 돌린다

    for (let t = 0; t < 4000; t++) {
      w.한턴();
      /* 이 자는 **기술이 나오는가**만 본다. 밸런스는 ash_막힘_시험 이 따로 잰다.
         그래서 전투가 중간에 끝나지 않게 붙들어 둔다 — 안 그러면 쿨 4짜리 「처형」이
         나올 틈도 없이 7턴 만에 전멸해서, 멀쩡한 기술이 "안 나온다"로 찍힌다. */
      // **꽉 채우면 안 된다** — 아무도 안 다치면 「구원의 진형」(누군가 20% 넘게 다쳐야 씀)이
      // 영영 조건을 못 만나 멀쩡한 기술이 "안 나온다"로 찍힌다. 60% 선에서 붙들어 둔다.
      for (const c of w.S.대원) if (c.hp > 0) c.hp = Math.max(c.hp, Math.floor(w.최대체력(c) * .6));
      if (w.적들?.[0]) w.적들[0].hp = Math.floor(w.적들[0].최대 * .3);   // 처형 조건(절반 아래)을 유지
      const 글 = (칸.textContent ?? "");
      if (/두 번 베었다/.test(글)) 연속봄 = true;
      if (/틈을 노린다/.test(글)) 벼름봄 = true;
      if (/치명타/.test(글)) 치명봄 = true;
      if (/처형/.test(글)) 처형봄 = true;
      if (/부패에 갉아먹혔다/.test(글)) 독봄 = true;
      if (/구원의 진형/.test(글)) 전체회복봄 = true;
      for (const e of w.적들 ?? []) if ((e.방어썩음 ?? 0) > 0) 방어썩음봄 = e.방어썩음;
      if (w.S.쉼 > 0) break;                       // 전멸하면 그만
    }
    본글.push((칸.textContent ?? "").slice(-200));

    /* 임시 딱지가 남아 있나 */
    const 임시들 = Object.entries(w.도감).filter(([, d]: any) => d.임시).map(([k]) => k);
    const 스킬수 = Object.fromEntries(Object.entries(w.도감).map(([k, d]: any) => [k, [].concat(d.스킬 ?? []).length]));

    return { 연속봄, 벼름봄, 치명봄, 처형봄, 독봄, 방어썩음봄, 전체회복봄, 배앞, 배뒤, 결의앞, 결의뒤, 임시들, 스킬수, 끝글: 본글[0] };
  });

  console.log(`  결의 — 풀피 공격 ${본.결의앞} · 체력 10% 일 때 배수 ${본.배뒤.toFixed(2)}`);
  재기("검사가 두 번 벤다(연속 베기)", 본.연속봄, 본);
  재기("검사가 약점을 노린다", 본.벼름봄, 본);
  재기("치명타가 실제로 난다", 본.치명봄, 본);
  재기("처형이 나온다", 본.처형봄, 본);
  재기("결의 — 체력이 낮으면 공격 배수가 오른다", 본.배뒤 > 본.배앞 && 본.배뒤 > 1.3, { 앞: 본.배앞, 뒤: 본.배뒤 });
  재기("회복술사가 전원을 회복한다(구원의 진형)", 본.전체회복봄, 본);
  재기("부패의 저주가 지속 피해를 준다", 본.독봄, 본);
  재기("부패의 저주가 적 방어를 깎는다", 본.방어썩음봄 > 0, 본.방어썩음봄);
  재기("임시 딱지가 남아 있지 않다", 본.임시들.length === 0, 본.임시들);
  재기("검사와 흑마법사가 기술을 둘씩 가진다", 본.스킬수.검사 === 2 && 본.스킬수.흑마법사 === 2, 본.스킬수);
} finally { await 창.browser.close(); await 창.close?.(); }
console.log(나쁨 === 0 ? "전부 통과" : `실패 ${나쁨}건`);
process.exit(나쁨 === 0 ? 0 : 1);
