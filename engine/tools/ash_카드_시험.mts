/**
 * **캐릭터 상세 화면** (10-10 전면 개편). 모델 0 · 값 0.
 *   ASH_URL=http://127.0.0.1:8124/ash/index.html npx tsx engine/tools/ash_카드_시험.mts [--sabotage]
 *
 * 10-09 까지는 작은 모달(카드창)이었다. 10-10 사장님 지시로 **화면 전체**를 쓰는
 * 대원창으로 바꾸고 모달은 지웠다. 그리고 **O/X 를 전부 걷어냈다** —
 * 글자 체크박스와 벗기기 X 는 사장님이 "끔찍하다"고 한 것이다.
 *
 * 재는 것: 목록이 간단한가 · 누르면 전체 화면이 뜨는가 · 좌우로 넘어가는가 ·
 * 장비가 **슬롯**인가 · 가방에서 끼고 벗는가 · 기술 설명이 낱낱이 있는가 · **O/X 가 없는가**.
 */
import { openHeadless } from "../../src/lib/video/headless";
import { 이름헬퍼 } from "./ash_공통.mjs";
const 주소 = process.env.ASH_URL ?? "https://rookery-web-production.up.railway.app/ash/index.html";
let 나쁨 = 0;
const 재기 = (n: string, ok: boolean, 본?: unknown) => { if (!ok) 나쁨++; console.log(ok ? "통과" : "실패", n, ok ? "" : JSON.stringify(본)); };

const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) { console.error("창 없음"); process.exit(1); }
try {
  const page = await 창.browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await 이름헬퍼(page);
  await page.goto(주소, { waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 2000));

  if (process.argv.includes("--sabotage")) await page.evaluate(() => {
    // 심은 고장: 옛 O/X 로 되돌린다(체크 글자 + 벗기기 표시)
    const w = window as any, 원 = w.대원창;
    w.대원창 = (el: HTMLElement) => { 원(el);
      el.innerHTML += '<span class="tag">✓ 출전</span><span class="tag">✕</span>'; };
  });

  await page.evaluate(() => { const w = window as any;
    w.S.대원.length || w.S.대원.push(w.대원만들기("기사", 5));
    // 만들기는 최고층 + 금화까지 본다 — 재료만 심으면 조용히 거절한다(10-09 자가 여기서 한 번 틀렸다)
    Object.assign(w.S.가방, { 파편: 99, 잔혼: 99, 수호핵: 9, 가죽: 99, 별가루: 999 });
    w.S.최고층 = Math.max(w.S.최고층, 10); w.S.금화 = Math.max(w.S.금화, 99999);
    if (!w.만들기("가죽갑옷")) throw new Error("장비를 못 만들었다 — 시험 밑바탕이 틀렸다");
    w.만들기("철검");
    w.S.보는대원 = null; w.S.탭 = "crew"; });
  await page.evaluate(() => (document.querySelector('.tab[data-t="crew"]') as HTMLElement).click());
  await new Promise((r) => setTimeout(r, 600));

  const 줄 = await page.evaluate(() => {
    const r = document.querySelector("#panel .row.카드열기");
    return r ? { 글: (r.textContent ?? "").trim(), 능력치: /체력 |공격 |방어 /.test(r.textContent ?? "") } : null;
  });
  재기("목록 줄이 눌리는 카드다", !!줄, 줄);
  재기("목록에 능력치가 없다", !!줄 && !줄.능력치, 줄?.글);

  /* ── 누르면 **모달이 아니라 화면 전체**가 바뀐다 ── */
  await page.evaluate(() => (document.querySelector("#panel .row.카드열기") as HTMLElement).click());
  await new Promise((r) => setTimeout(r, 500));
  const 상세 = await page.evaluate(() => {
    const el = document.querySelector("#panel")!;
    return { 덮개: !!document.querySelector("#덮개"),
      머리띠: !!el.querySelector(".머리띠"), 뒤로: !!el.querySelector("#뒤로"),
      전투력: /전투력/.test(el.textContent ?? ""), 능력치: /체력/.test(el.textContent ?? ""),
      슬롯수: el.querySelectorAll("[data-슬롯]").length, 서브탭: el.querySelectorAll("[data-대원탭]").length,
      대표: !!el.querySelector("#대표로") };
  });
  재기("모달이 아니라 전체 화면이다", 상세.머리띠 && !상세.덮개, 상세);
  재기("전투력과 능력치가 보인다", 상세.전투력 && 상세.능력치, 상세);
  // 10-10 사장님 "무기 / 갑옷 / **장신구**" — 장신구는 아직 레시피가 없어도 **칸은 있어야** 한다
  재기("장비가 슬롯 셋이다(무기·갑옷·장신구)", 상세.슬롯수 === 3, 상세);
  재기("서브탭이 셋이다(장비·강화·기술)", 상세.서브탭 === 3, 상세);
  재기("대표로 단추가 있다", 상세.대표, 상세);

  /* ── 좌우로 다음 대원 ── */
  const 넘김 = await page.evaluate(() => {
    const w = window as any, 앞 = w.S.보는대원;
    (document.querySelector("#뒷사람") as HTMLElement).click();
    const 뒤 = w.S.보는대원;
    (document.querySelector("#앞사람") as HTMLElement).click();
    return { 앞, 뒤, 돌아옴: w.S.보는대원 };
  });
  재기("좌우 화살표로 다음 대원에 간다", 넘김.뒤 !== 넘김.앞 && 넘김.돌아옴 === 넘김.앞, 넘김);

  /* ── 슬롯을 누르면 가방, 거기서 끼고 벗는다 ── */
  await new Promise((r) => setTimeout(r, 300));
  const 가방 = await page.evaluate(async () => {
    const w = window as any;
    (document.querySelector('[data-슬롯="갑옷"]') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 200));
    // 10-10 사장님 "아래 가방 패널" — **모달이 아니라 같은 화면 안**이어야 한다
    const 떴나 = !!document.querySelector("#panel .가방패널");
    const 덮개 = !!document.querySelector("#덮개");
    (document.querySelector("#panel [data-낄]") as HTMLElement | null)?.click();
    return { 떴나, 덮개, 낀뒤: w.S.가방.장비.filter((x: any) => x.누구 != null).length };
  });
  재기("슬롯을 누르면 **아래 패널**로 가방이 열린다(모달 아님)", 가방.떴나 && !가방.덮개, 가방);
  재기("가방에서 고르면 실제로 입는다", 가방.낀뒤 > 0, 가방);

  await new Promise((r) => setTimeout(r, 400));
  const 벗 = await page.evaluate(async () => {
    const w = window as any;
    if (!document.querySelector("#panel .가방패널")) (document.querySelector('[data-슬롯="갑옷"]') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 200));
    const 벗김 = document.querySelector("#panel [data-벗김]") as HTMLElement | null;
    const 있나 = !!벗김;
    벗김?.click();
    return { 있나, 낀: w.S.가방.장비.filter((x: any) => x.누구 != null).length };
  });
  재기("가방에 벗기 칸이 있다", 벗.있나, 벗);
  재기("벗기면 실제로 벗는다", 벗.낀 === 0, 벗);

  /* ── 기술 — 낱낱이, 설명과 함께 ── */
  await new Promise((r) => setTimeout(r, 300));
  const 기술 = await page.evaluate(async () => {
    const w = window as any;
    document.querySelector("#덮개")?.remove();
    w.S.가방슬롯 = null;
    const 검 = w.S.대원.find((c: any) => c.키 === "검사");
    if (검) w.S.보는대원 = 검.id;
    w.S.대원탭 = "기술"; w.화면();
    await new Promise((r) => setTimeout(r, 200));
    const 태그 = [...document.querySelectorAll('#panel [data-풀이^="기술"]')].map((x) => (x.textContent ?? "").trim());
    (document.querySelector('#panel [data-풀이^="기술"]') as HTMLElement)?.click();
    const p = document.querySelector("#panel #풀이") as HTMLElement;
    const 글 = p?.classList.contains("on") ? (p.textContent ?? "") : "";
    // 도감에 적힌 모든 기술·특성에 설명이 있나
    const 빠진: string[] = [];
    for (const [키, d] of Object.entries(w.도감) as [string, any][]) {
      for (const k of [d.일반, ...[].concat(d.스킬 ?? []), d.궁].filter(Boolean) as string[])
        if (!w.기술설명?.[k]) 빠진.push(`${키}:${k}`);
      for (const t of d.특성 ?? []) if (!w.특성설명?.[t]) 빠진.push(`${키}:특성 ${t}`);
    }
    return { 태그, 글, 빠진 };
  });
  재기("검사 기술이 낱낱이 셋 보인다", 기술.태그.length === 3 && !기술.태그.some((t) => /,/.test(t)), 기술.태그);
  재기("기술을 누르면 설명이 뜬다", 기술.글.length > 10 && /[0-9]/.test(기술.글), 기술.글.slice(0, 60));
  재기("도감의 모든 기술·특성에 설명이 있다", 기술.빠진.length === 0, 기술.빠진);

  /* ── **O/X 가 없는가** (10-10 사장님 "싹 없애라") ── */
  const 오엑스 = await page.evaluate(() => {
    const w = window as any;
    const 글들: string[] = [];
    for (const t of ["crew", "forge", "shop"]) { w.S.탭 = t; w.화면(); 글들.push(document.querySelector("#panel")?.textContent ?? ""); }
    w.S.탭 = "crew"; w.S.보는대원 = w.S.대원[0].id; w.S.대원탭 = "장비"; w.화면();
    글들.push(document.querySelector("#panel")?.textContent ?? "");
    document.querySelector("#덮개")?.remove();
    w.출발창(1);
    글들.push(document.querySelector("#덮개")?.textContent ?? "");
    document.querySelector("#덮개")?.remove();
    return 글들.join(" ").match(/[✓✕☑☒]/g) ?? [];
  });
  재기("화면에 O/X 글자가 없다", 오엑스.length === 0, 오엑스);

  재기("내리기·태우기 단추가 없다", await page.evaluate(() => !/내리기|태우기/.test(document.querySelector("#panel")?.textContent ?? "")));
  /* ── 가방 **독립 창** (10-10 사장님 "독립된 그리드 아이템창 신설, 재료/장비/소모품 탭 분류") ── */
  const 창들 = await page.evaluate(async () => {
    const w = window as any;
    document.querySelector("#덮개")?.remove();
    Object.assign(w.S.가방, { 파편: 50, 가죽: 20, 약: 3 });
    (document.querySelector("#가방단추") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 150));
    const 덮 = document.querySelector("#덮개");
    const 탭수 = 덮?.querySelectorAll("[data-가방탭]").length ?? 0;
    const 재료칸 = 덮?.querySelectorAll("[data-재료]").length ?? 0;
    // 재료 하나를 눌러 상세가 뜨는지
    (덮?.querySelector("[data-재료]") as HTMLElement | null)?.click();
    await new Promise((r) => setTimeout(r, 120));
    const 상세들 = document.querySelectorAll("#덮개").length;
    const 상세글 = [...document.querySelectorAll("#덮개")].map((x) => x.textContent ?? "").join(" ");
    // 장비 탭 · 소모품 탭
    document.querySelectorAll("#덮개").forEach((x, i) => { if (i > 0) x.remove(); });
    (document.querySelector('[data-가방탭="장비"]') as HTMLElement)?.click();
    const 장비칸 = document.querySelectorAll("[data-템]").length;
    (document.querySelector('[data-가방탭="소모품"]') as HTMLElement)?.click();
    const 소모칸 = document.querySelectorAll("[data-소모]").length;
    document.querySelectorAll("#덮개").forEach((x) => x.remove());
    return { 탭수, 재료칸, 상세들, 쓰는곳: /쓰는 곳/.test(상세글), 장비칸, 소모칸 };
  });
  /* 10-11 영혼석 칸이 붙어 탭이 셋 → **넷**이 됐다. 숫자를 박아 두면 칸이 늘 때마다
     자가 거짓 경보를 낸다 — "적어도 넷은 있다"로 본다(없어지는 것은 그대로 잡힌다). */
  재기("상단에서 가방 창이 열린다", 창들.탭수 >= 4, 창들);
  재기("재료가 칸으로 보인다", 창들.재료칸 >= 2, 창들);
  재기("재료를 누르면 상세가 뜨고 쓰는 곳을 알려 준다", 창들.상세들 >= 2 && 창들.쓰는곳, 창들);
  재기("장비·소모품 탭에도 칸이 있다", 창들.장비칸 >= 1 && 창들.소모칸 === 1, 창들);

  재기("캐릭터 탭에 별빛 회복약이 없다", await page.evaluate(() => {
    const w = window as any; w.S.보는대원 = null; w.S.탭 = "crew"; w.화면();
    return !/회복약/.test(document.querySelector("#panel")?.textContent ?? "");
  }));
} finally { await 창.browser.close(); await 창.close?.(); }
console.log(나쁨 === 0 ? "전부 통과" : `실패 ${나쁨}건`);
process.exit(나쁨 === 0 ? 0 : 1);
