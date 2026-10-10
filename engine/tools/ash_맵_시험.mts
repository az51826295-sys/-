/**
 * **탑 맵이 되는가** (10-09). 모델 0 · 값 0.
 *   ASH_URL=http://127.0.0.1:8123/ash/index.html npx tsx engine/tools/ash_맵_시험.mts
 * 맵이 뜨나 · 꼭대기가 위인가 · 깬 층까지만 있나 · 누르면 출전 고르는 창이 뜨나 · 떠나면 맵이 사라지나.
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
  // **이빨 확인**: --sabotage 면 사장님이 "이상해"라 한 꼴을 일부러 되살린다. 그래도 전부 통과하면 자가 눈이 먼 것이다.
  if (process.argv.includes("--sabotage")) await page.evaluate(() => {
    const w = window as any, 원 = w.맵그리기;
    w.맵그리기 = () => { 원(); const 탑 = document.querySelector("#맵 .탑");
      if (탑 && !탑.querySelector("img")) 탑.innerHTML = `<img class="꼭대기" src="art/tower-top.png" style="width:256px">`;
      document.querySelector("#탑버튼")?.classList.remove("on"); };
  });
  await page.evaluate(() => { const w = window as any;
    for (let i = 1; i < 9999; i++) clearInterval(i);
    w.S.깸 = {}; w.S.보스깸 = []; for (let f = 1; f < 7; f++) w.S.깸[f] = 99;
    w.S.최고층 = w.열린층(); w.S.진행 = false; w.S.탭 = "run"; w.화면(); w.맵그리기(); });
  await new Promise((r) => setTimeout(r, 500));

  const 맵 = await page.evaluate(() => {
    const el = document.querySelector("#맵");
    const 칸들 = Array.from(document.querySelectorAll("#맵 [data-f]")).map((x) => Number((x as HTMLElement).dataset.f));
    return el ? { 보임: getComputedStyle(el).display !== "none", 칸들, 넘침: el.scrollHeight > el.clientHeight } : null;
  });
  재기("맵이 보인다", !!맵?.보임, 맵);
  // 10-09 사장님 "탑 고를 때 전투 화면이 왜 있냐고"
  재기("탑을 고를 땐 전투 칸이 접힌다",
    await page.evaluate(() => getComputedStyle(document.querySelector("#board")!).display === "none"));
  재기("열린 층까지만 있다", JSON.stringify(맵?.칸들) === JSON.stringify([7,6,5,4,3,2,1]), 맵?.칸들);
  재기("맨 위가 가장 높은 층", 맵?.칸들?.[0] === 7, 맵?.칸들?.[0]);

  await page.evaluate(() => (document.querySelector('#맵 [data-f="5"]') as HTMLElement).click());
  await new Promise((r) => setTimeout(r, 400));
  const 창열림 = await page.evaluate(() => {
    const d = document.querySelector("#덮개");
    return d ? { 글: (d.textContent ?? "").slice(0, 40), 동료: d.querySelectorAll("[data-넣]").length, 들어가기: !!d.querySelector("#들어가기") } : null;
  });
  재기("층을 누르면 출발 창이 뜬다", !!창열림, 창열림);
  재기("출전 고를 동료가 있다", (창열림?.동료 ?? 0) > 0, 창열림);
  // 약은 캐릭터 창에서 빼고 **떠나기 직전 자리**로 옮겼다 (10-09 사장님)
  const 약 = await page.evaluate(() => {
    const w = window as any;
    w.S.가방.약 = 3; w.S.약수 = 0;
    const 더 = document.querySelector('#덮개 [data-약="1"]') as HTMLElement | null;
    if (!더) return null;
    더.click(); 더.click();                                  // 0 → 2
    const 둘 = w.S.약수;
    (document.querySelector('#덮개 [data-약="-1"]') as HTMLElement).click();   // 2 → 1
    const 하나 = w.S.약수;
    for (let i = 0; i < 9; i++) 더.click();                  // 가진 것(3)보다 많이는 못 챙긴다
    return { 있다: true, 둘, 하나, 끝: w.S.약수, 글: (document.querySelector("#덮개")?.textContent ?? "") };
  });
  재기("출발 창에서 약을 **몇 병** 챙길지 고른다", !!약 && 약.둘 === 2 && 약.하나 === 1 && /회복약/.test(약.글), 약);
  재기("가진 것보다 많이는 못 챙긴다", 약?.끝 === 3, 약);

  const 뺐다 = await page.evaluate(() => {
    const w = window as any; const 앞 = w.S.파티.length;
    (document.querySelector("#덮개 [data-넣]") as HTMLElement).click();
    return { 앞, 뒤: w.S.파티.length };
  });
  재기("출전 넣고 빼기가 먹는다", 뺐다.앞 !== 뺐다.뒤, 뺐다);

  await new Promise((r) => setTimeout(r, 300));
  const 떠남 = await page.evaluate(() => {
    const w = window as any;
    if (!w.S.파티.length) (document.querySelector("#덮개 [data-넣]") as HTMLElement).click();
    (document.querySelector("#덮개 #들어가기") as HTMLElement).click();
    return { 층: w.S.층, 사냥층: w.S.사냥층, 진행: w.S.진행, 덮개: !!document.querySelector("#덮개") };
  });
  재기("들어가면 그 층을 되돌이로 돈다", 떠남.층 === 5 && 떠남.사냥층 === 5 && 떠남.진행 === true && !떠남.덮개, 떠남);
  // 접었던 전투 칸이 다시 펴지고 폭이 살아나야 한다 — 접힌 채로 캔버스를 그리면 폭 0 이 된다
  const 폈나 = await page.evaluate(() => {
    const b = document.querySelector("#board") as HTMLElement, cv = document.querySelector("#cv") as HTMLCanvasElement;
    return { 보임: getComputedStyle(b).display !== "none", 판폭: cv.width, 칸폭: b.clientWidth };
  });
  재기("떠나면 전투 칸이 다시 펴지고 폭이 산다", 폈나.보임 && 폈나.판폭 > 0 && 폈나.칸폭 > 0, 폈나);
  await new Promise((r) => setTimeout(r, 300));
  재기("떠나면 맵이 사라진다", await page.evaluate(() => getComputedStyle(document.querySelector("#맵")!).display === "none"));

  /* ── 10-09 사장님 "이상해" 가 가리킨 것들 ───────────────────────────── */
  const 떠난뒤 = await page.evaluate(() => {
    const b = document.querySelector("#탑버튼") as HTMLElement;
    return { 단추: !!b, 보임: b ? getComputedStyle(b).display !== "none" : false };
  });
  재기("전투 중엔 탑 단추가 보인다", 떠난뒤.단추 && 떠난뒤.보임, 떠난뒤);

  const 돌아옴 = await page.evaluate(() => {
    const w = window as any;
    (document.querySelector("#탑버튼") as HTMLElement).click();
    return { 진행: w.S.진행, 사냥층: w.S.사냥층,
      맵: getComputedStyle(document.querySelector("#맵")!).display !== "none",
      단추: getComputedStyle(document.querySelector("#탑버튼")!).display !== "none" };
  });
  재기("탑 단추를 누르면 멈추고 맵이 뜬다", 돌아옴.진행 === false && 돌아옴.사냥층 === null && 돌아옴.맵, 돌아옴);
  재기("맵이 떠 있을 땐 탑 단추가 숨는다", 돌아옴.단추 === false, 돌아옴);

  // 꼭대기 그림은 **끝까지 올랐을 때만**. 7층인데 꼭대기가 보이면 다 오른 것처럼 보인다.
  재기("낮은 층에선 꼭대기 그림이 없다", await page.evaluate(() => !document.querySelector("#맵 .꼭대기")));
  const 끝 = await page.evaluate(async () => {
    const w = window as any; w.S.최고층 = 100; w.맵그리기();
    const im = document.querySelector("#맵 .꼭대기") as HTMLImageElement | null;
    if (im && !im.complete) await new Promise((r) => { im.onload = r; im.onerror = r; });  // 막 붙인 그림은 아직 안 왔다
    return { 있다: !!im, 폭: im?.naturalWidth ?? 0 };
  });
  재기("100층을 열면 꼭대기가 뜨고 그림이 실제로 온다", 끝.있다 && 끝.폭 > 0, 끝);

  // 탑 기둥 그림이 진짜 불러와졌는가 — 주소가 어긋나면 벽지 없이 까만 목록이 된다
  const 기둥 = await page.evaluate(async () => {
    const t = document.querySelector("#맵 .탑") as HTMLElement;
    const u = getComputedStyle(t).backgroundImage.match(/url\("?([^")]+)"?\)/)?.[1];
    if (!u) return { 주소: null as string | null, 상태: 0 };
    const r = await fetch(u, { method: "GET" });
    return { 주소: u, 상태: r.status };
  });
  재기("탑 기둥 그림이 실제로 온다", 기둥.상태 === 200, 기둥);

  // 포스터꼴: 층이 하나뿐인데 **스크롤이 생기면** 그림 높이만큼 부푼 것이다.
  // (화면을 꽉 채우는 것은 괜찮다 — 탑이 끝까지 서 있어야 탑으로 보인다)
  const 한층 = await page.evaluate(() => {
    const w = window as any; w.S.최고층 = 0; w.맵그리기();
    const 맵 = document.querySelector("#맵") as HTMLElement;
    return { 칸수: document.querySelectorAll("#맵 [data-f]").length,
      속높이: (document.querySelector("#맵 .속") as HTMLElement).offsetHeight,
      맵높이: 맵.clientHeight, 스크롤: 맵.scrollHeight > 맵.clientHeight + 2 };
  });
  재기("층이 하나면 스크롤이 안 생긴다(포스터꼴 아님)", 한층.칸수 === 1 && !한층.스크롤, 한층);

  /* ── 10-10 사장님 "캐릭터는 4마리가 한계" · "진행 점 없애" ──
     **맨 뒤에서 잰다** — 중간에 창을 새로 열면 앞 단계의 흐름이 끊긴다(10-10 그래서 한 번 틀렸다). */
  const 한도 = await page.evaluate(() => {
    const w = window as any;
    document.querySelectorAll("#덮개").forEach((x) => x.remove());
    while (w.S.대원.length < 6) w.S.대원.push(w.대원만들기("검사", 5));
    w.S.파티 = [];
    w.출발창(1);
    const 덮 = document.querySelector("#덮개")!;
    const 칸수 = 덮.querySelectorAll(".칸슬롯").length;
    for (const b of [...덮.querySelectorAll("[data-넣]")] as HTMLElement[]) b.click();
    const 끝 = { 칸수, 파티: w.S.파티.length, 한도: w.파티한도, 점줄: !!document.querySelector("#덮개 .점줄") };
    document.querySelectorAll("#덮개").forEach((x) => x.remove());
    return 끝;
  });
  재기("파티 자리가 넷이다", 한도.칸수 === 4 && 한도.한도 === 4, 한도);
  재기("넷을 넘겨 못 넣는다", 한도.파티 === 4, 한도);
  재기("진행 점이 없다", 한도.점줄 === false, 한도);
} finally { await 창.browser.close(); await 창.close?.(); }
console.log(나쁨 === 0 ? "\n전부 통과" : `\n실패 ${나쁨}건`);
process.exit(나쁨 === 0 ? 0 : 1);
