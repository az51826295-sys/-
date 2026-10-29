/**
 * **자동 등반이 멈춰야 할 때 멈추나** (10-29, 설계서 3③).
 *   ASH_URL=... npx tsx engine/tools/ash_자동등반.mts
 *   ASH_SABOTAGE=1 …  목표 정지를 **무시하게** 만든다(자가 눈이 있나)
 *
 * 자동 등반 자체는 10-09 부터 있었다. 없던 것은 **목표 층에서 멈추기**와 **요약**이다.
 *
 * ## 멈추는 것만 재면 안 된다
 *
 * "안 올라갔다" 는 **꺼져 있어도** 참이다. 그래서 둘을 같이 본다:
 *   · 목표가 없으면 **올라간다**
 *   · 목표가 있으면 그 층에서 **멈추고 꺼진다**
 * 앞엣것을 빼면 자동 등반이 통째로 고장 난 판도 통과한다.
 *
 * ## 판마다 화면을 새로 연다
 *
 * 처음엔 한 화면에서 두 판을 돌렸는데, 첫 판이 `최고층` 을 올려 놓는 바람에 둘째 판에서
 * **"자격이 새로 찼다" 가 한 번도 안 일어나** 한 층도 못 올랐다. 자가 자기 흔적 위에서
 * 잰 것이다([[rulers-must-not-share-a-screen]]).
 *
 * 가방 용량 정지는 **안 잰다** — 이 게임엔 가방 한도가 없다. 없는 것을 어긋남으로 적지 않는다.
 */
import { openHeadless } from "../../src/lib/video/headless";
import { 이름헬퍼 } from "./ash_공통.mjs";

const 주소 = process.env.ASH_URL ?? "https://rookery-web-production.up.railway.app/ash/index.html";
const 사보타주 = process.env.ASH_SABOTAGE === "1";

const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) process.exit(1);

/** 화면 하나를 새로 열어 한 판만 돌린다. */
async function 한판(목표: number, 끄기: boolean) {
  const page = await 창!.browser.newPage();
  try {
    await 이름헬퍼(page);
    await page.goto(주소, { waitUntil: "networkidle2", timeout: 60_000 });
    await new Promise((r) => setTimeout(r, 1500));
    return await page.evaluate((a: { 목표: number; 끄기: boolean }) => {
      const w = window as unknown as Record<string, any>;
      if (w.S.자동목표 === undefined) return { 못잼: "자동목표 가 없다 — 옛 판이 떠 있다" };
      for (let i = 1; i < 9999; i++) clearInterval(i);
      try { localStorage.clear(); } catch { /* 없어도 된다 */ }
      if (a.끄기) { const 원 = w.자동끄기; w.자동끄기 = (까닭: string) => { if (까닭 !== "목표") 원(까닭); }; }

      w.S.층 = 1; w.S.최고층 = 0; w.S.단계 = 1; w.S.쉼 = 0; w.S.진행 = true;
      w.S.자동오름 = true; w.S.자동목표 = a.목표; w.자동시작();
      w.전투준비(); w.적만들기();
      for (let i = 0; i < 30000; i++) { try { w.한턴(); } catch { /* 전멸 */ } }

      const 끝층 = w.S.층, 끝켜짐 = w.S.자동오름;
      /* 요약은 **따로 연다.** 돌리는 동안 관문에서 무너지면 자동이 꺼지면서 기록이 비는데,
         그걸 "요약이 안 된다" 로 읽으면 멀쩡한 것을 고치러 간다(10-29 에 그럴 뻔했다). */
      w.자동시작(); w.S.금화 += 500;
      const 요약 = w.자동요약();
      return { 층: 끝층, 켜짐: 끝켜짐, 요약 };
    }, { 목표, 끄기 });
  } finally { await page.close().catch(() => {}); }
}

try {
  const 없음 = await 한판(0, 사보타주) as Record<string, any>;
  if (없음.못잼) { console.log("못 잼:", 없음.못잼); process.exit(2); }
  /* 목표는 **닿을 수 있는 곳**으로 둔다. 안 닿으면 정지를 시험한 적이 없는 것이다. */
  const 목표층 = 3;
  const 목표판 = await 한판(목표층, 사보타주) as Record<string, any>;

  console.log(`목표 없이: ${없음.층}층까지 올라감`);
  console.log(`목표 ${목표층}층: ${목표판.층}층에서 멈춤 · 아직 켜짐 ${목표판.켜짐}`);
  console.log(`요약: ${JSON.stringify(목표판.요약)}`);

  /* 목표에 **닿지도 못했으면** 정지는 시험된 적이 없다 — 어긋남이 아니라 못 잼이다. */
  const 닿음 = 목표판.층 >= 목표층;
  const 판정: [string, boolean | null][] = [
    ["목표가 없으면 올라간다", 없음.층 >= 3],
    ["목표 층을 안 넘는다", 목표판.층 <= 목표층],
    ["멈추면 꺼진다", 닿음 ? 목표판.켜짐 === false : null],
    ["요약에 번 것이 적힌다", (목표판.요약?.금화 ?? 0) >= 500],
  ];
  let 나쁨 = 0;
  console.log("");
  for (const [n, ok] of 판정) { if (ok === false) 나쁨++; console.log(`${ok === null ? "못 잼 " : ok ? "맞음  " : "어긋남"} ${n}`); }
  if (사보타주) console.log("\n사보타주(목표 정지를 무시): 어긋남이 0 이면 **자가 정지를 안 보고 있다**.");
  process.exit(나쁨 === 0 ? 0 : 1);
} finally {
  await 창.browser.close().catch(() => {});
}
