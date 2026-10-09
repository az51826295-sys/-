/**
 * **난이도를 숫자로 잰다** (10-09 사장님 "지금 난이도가 너무 쉬워"). 모델 0 · 값 0.
 *   ASH_URL=http://127.0.0.1:8123/ash/index.html npx tsx engine/tools/ash_난이도.mts [끝층=40]
 *
 * "쉽다/어렵다" 는 형용사라 자를 못 견딘다 — 실제로 돌려서 **층당 턴 수 · 전멸 횟수 ·
 * 층을 깬 순간 아군 체력 %** 를 센다. 고친 뒤 같은 자로 다시 재면 바뀐 것이 보인다.
 *
 * 게임 안의 `한턴()` 을 그대로 부른다(따로 셈을 베끼면 게임과 다른 것을 재게 된다).
 */
import { openHeadless } from "../../src/lib/video/headless";
import { 이름헬퍼 } from "./ash_공통.mts";

const 주소 = process.env.ASH_URL ?? "https://rookery-web-production.up.railway.app/ash/index.html";
const 끝층 = Number(process.argv[2] ?? 40);

const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) { console.error("창을 못 띄웠다"); process.exit(1); }
try {
  const page = await 창.browser.newPage();
  await 이름헬퍼(page);
  await page.goto(주소, { waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 1800));

  const 결과 = await page.evaluate((끝층: number) => {
    const w = window as any;
    try { localStorage.clear(); } catch { /* 없어도 된다 */ }
    for (let i = 1; i < 9999; i++) clearInterval(i);           // 게임이 스스로 도는 것을 멈춘다
    // 처음부터: 기본 대원으로 1층부터 쭉
    w.S.층 = 1; w.S.단계 = 1; w.S.최고층 = 0; w.S.쉼 = 0; w.S.사냥층 = null; w.S.진행 = true;
    w.전투준비(); w.적만들기();

    const 층기록: Array<{ 층: number; 턴: number; 남은체력: number; 레벨: number }> = [];
    let 전멸수 = 0, 턴 = 0, 층턴 = 0, 앞층 = w.S.층;
    const 체력퍼센트 = () => {
      const p = w.S.대원.filter((c: any) => w.S.파티.includes(c.id));
      if (!p.length) return 0;
      const 합 = p.reduce((a: number, c: any) => a + Math.max(0, c.hp) / w.최대체력(c), 0);
      return Math.round(합 / p.length * 100);
    };
    const 앞전멸 = () => w.S.쉼 > 0;

    while (w.S.층 <= 끝층 && 턴 < 60_000) {
      const 쉼앞 = w.S.쉼;
      w.한턴(); 턴++; 층턴++;
      if (w.S.쉼 > 쉼앞) 전멸수++;                              // 쉼이 새로 걸린 것 = 전멸
      if (w.S.층 !== 앞층) {
        층기록.push({ 층: 앞층, 턴: 층턴, 남은체력: 체력퍼센트(), 레벨: w.S.대원[0]?.레벨 ?? 0 });
        앞층 = w.S.층; 층턴 = 0;
      }
    }
    return { 층기록, 전멸수, 총턴: 턴, 대원수: w.S.대원.length };
  }, 끝층);

  const { 층기록, 전멸수, 총턴, 대원수 } = 결과 as {
    층기록: Array<{ 층: number; 턴: number; 남은체력: number; 레벨: number }>; 전멸수: number; 총턴: number; 대원수: number;
  };
  console.log(`\n1~${끝층}층 · 대원 ${대원수}명 · 총 ${총턴}턴 · **전멸 ${전멸수}번**\n`);
  console.log("층".padStart(4), "턴".padStart(5), "깬뒤 체력".padStart(10), "레벨".padStart(5));
  for (const r of 층기록) {
    if (r.층 % 5 === 0 || r.층 === 1 || r.층 % 10 === 0)
      console.log(String(r.층).padStart(4), String(r.턴).padStart(5), `${r.남은체력}%`.padStart(10), String(r.레벨).padStart(5));
  }
  const 평균턴 = 층기록.length ? 층기록.reduce((a, r) => a + r.턴, 0) / 층기록.length : 0;
  const 평균체력 = 층기록.length ? 층기록.reduce((a, r) => a + r.남은체력, 0) / 층기록.length : 0;
  const 보스 = 층기록.filter((r) => r.층 % 10 === 0);
  console.log(`\n평균 층당 ${평균턴.toFixed(1)}턴 · 깬 뒤 평균 체력 ${평균체력.toFixed(0)}%`);
  if (보스.length) console.log(`보스층 평균 ${(보스.reduce((a,r)=>a+r.턴,0)/보스.length).toFixed(1)}턴 · 깬 뒤 ${(보스.reduce((a,r)=>a+r.남은체력,0)/보스.length).toFixed(0)}%`);
} finally {
  await 창.browser.close(); await 창.close?.();
}
