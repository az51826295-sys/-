/**
 * **잡몹과 관문 보스 중 누가 더 센가** (10-11). 모델 0 · 값 0.
 *   ASH_URL=http://127.0.0.1:8124/ash/index.html npx tsx engine/tools/ash_성장곡선.mts
 *
 * 10-11 에 T5 를 +880 에서 +1020 으로 올려도 **막히는 층이 57 로 똑같았다.**
 * 장비로 안 움직이는 벽은 장비 탓이 아니다 — 그래서 층마다 **실제로 세워지는 것**을 재 본다.
 *
 * 손으로 식을 베껴 적지 않는다. `적만들기()` 를 그 층에서 돌리고 **세워진 것의 체력·공격을 센다.**
 * (식을 베끼면 게임이 바뀌어도 이 자는 옛 식을 계속 맞다고 한다.)
 */
import { openHeadless } from "../../src/lib/video/headless";
import { 이름헬퍼 } from "./ash_공통.mjs";
const 주소 = process.env.ASH_URL ?? "https://rookery-web-production.up.railway.app/ash/index.html";
const 층들 = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) process.exit(1);
try {
  const page = await 창.browser.newPage();
  await 이름헬퍼(page);
  await page.goto(주소, { waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 1800));

  const 본 = await page.evaluate((층들: number[]) => {
    const w = window as any;
    for (let i = 1; i < 9999; i++) clearInterval(i);
    w.requestAnimationFrame = () => 0;
    const 줄: any[] = [];
    for (const f of 층들) {
      w.S.층 = f; w.S.최고층 = f;
      // 관문 보스
      w.적만들기(0);
      const 보스 = (w.적들 ?? []).map((e: any) => ({ hp: e.최대 ?? e.hp, 공: e.공격 }));
      // 같은 층의 **잡몹 한 무리** — 보스층은 무리가 하나라, 잡몹은 한 층 아래에서 센다
      w.S.층 = f - 1;
      w.적만들기(0);
      const 잡 = (w.적들 ?? []).map((e: any) => ({ hp: e.최대 ?? e.hp, 공: e.공격 }));
      const 합 = (xs: any[], k: string) => Math.round(xs.reduce((a, x) => a + x[k], 0));
      줄.push({
        층: f,
        보스hp: 합(보스, "hp"), 보스공: 합(보스, "공"),
        잡hp: 합(잡, "hp"), 잡공: 합(잡, "공"), 잡수: 잡.length,
        무리수: w.무리수(f - 1),
      });
    }
    return 줄;
  }, 층들);

  console.log(" 관문   보스 HP     잡몹 한 무리 HP   한 층 전체(무리×)   보스/층  |  보스 공   잡몹 공");
  let 뒤집힘: number | null = null;
  for (const r of 본) {
    const 층전체 = r.잡hp * r.무리수;
    const 비 = +(r.보스hp / 층전체).toFixed(2);
    if (뒤집힘 === null && 비 < 1) 뒤집힘 = r.층;
    console.log(
      `${String(r.층).padStart(4)} ${String(r.보스hp).padStart(10)} ${String(r.잡hp).padStart(16)}`
      + ` ${String(층전체).padStart(18)} ${String(비).padStart(9)}  | ${String(r.보스공).padStart(8)} ${String(r.잡공).padStart(9)}`);
  }
  console.log(
    뒤집힘
      ? `\n**${뒤집힘}층부터 관문 보스가 그 아래 평범한 한 층보다 물렁하다.**\n`
        + "  관문이 벽이라는 설계가 거기서 뒤집힌다 — 장비를 아무리 올려도 평범한 층에서 막힌다."
      : "\n모든 층에서 관문 보스가 평범한 층보다 무겁다.");
} finally { await 창.browser.close(); await 창.close?.(); }
