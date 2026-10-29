/**
 * **무작위 옵션이 제대로 붙나** (10-29). 모델 0 · 값 0.
 *   ASH_URL=... npx tsx engine/tools/ash_옵션.mts
 *   ASH_SABOTAGE=1 …  옵션을 **장비몫에서 빼 본다**(자가 눈이 있나)
 *
 * 10-28 설계서 3②. 같은 레시피로 만들어도 나오는 것이 달라야 한다.
 *
 * ## 무엇을 재나
 *
 * 1. **등급이 섞여 나오나** — 다 일반이면 시스템이 없는 것과 같다
 * 2. **옵션 값이 그 장비에서 나오나** — 고정 숫자면 T1 에선 과하고 T10 에선 티도 안 난다
 * 3. **없는 칸에 안 붙나** — 체력이 없는 검에 "체력 +12" 는 0 이 된다(장식)
 * 4. **힘이 실제로 올라가나** — 표에만 적히고 `장비몫` 이 안 세면 **보이기만 하는 옵션**이다
 *
 * 4번이 핵심이다. 1~3 만 재면 **화면에만 있는 시스템**을 통과시킨다.
 */
import { openHeadless } from "../../src/lib/video/headless";
import { 이름헬퍼 } from "./ash_공통.mjs";

const 주소 = process.env.ASH_URL ?? "https://rookery-web-production.up.railway.app/ash/index.html";
const 사보타주 = process.env.ASH_SABOTAGE === "1";

const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) process.exit(1);
try {
  const page = await 창.browser.newPage();
  await 이름헬퍼(page);
  await page.goto(주소, { waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 1800));

  const 본 = await page.evaluate((끄기: boolean) => {
    const w = window as unknown as Record<string, any>;
    if (!w.옵션뽑기) return { 못잼: "옵션뽑기 가 없다 — 옛 판이 떠 있다" };

    /* ① 500번 뽑아 등급·칸을 센다. 무작위라 한 번 뽑고 말하면 안 된다. */
    const 등급셈: Record<string, number> = {};
    const 칸셈: Record<string, number> = {};
    let 옵션합 = 0, 뽑기수 = 0, 없는칸붙음 = 0;
    const 검효과 = w.레시피["철검"].효과;
    for (let i = 0; i < 500; i++) {
      const { 등급, 옵션 } = w.옵션뽑기("철검");
      등급셈[등급] = (등급셈[등급] ?? 0) + 1;
      뽑기수++;
      for (const o of 옵션) {
        칸셈[o.칸] = (칸셈[o.칸] ?? 0) + 1;
        옵션합 += o.값 / (검효과[o.칸] ?? 1);
        if (!((검효과[o.칸] ?? 0) > 0)) 없는칸붙음++;     // 검엔 공격만 있다
      }
    }

    /* ② 값이 **그 장비에서** 나오나 — 싼 장비와 비싼 장비의 옵션 크기를 견준다. */
    const 큰키 = Object.keys(w.레시피).find((k) => (w.레시피[k].효과?.공격 ?? 0) > 300) ?? "철검";
    let 작은평균 = 0, 큰평균 = 0, 작은n = 0, 큰n = 0;
    for (let i = 0; i < 300; i++) {
      for (const o of w.옵션뽑기("철검").옵션) { 작은평균 += o.값; 작은n++; }
      for (const o of w.옵션뽑기(큰키).옵션) { 큰평균 += o.값; 큰n++; }
    }
    작은평균 = 작은n ? 작은평균 / 작은n : 0;
    큰평균 = 큰n ? 큰평균 / 큰n : 0;

    /* ③ **힘이 진짜 오르나** — 같은 사람에게 옵션 없는 것과 있는 것을 끼워 공격을 잰다.
       표를 읽지 않고 게임이 쓰는 `능력()`(최종 수치)으로 본다. */
    const c = w.S.대원[0];
    w.S.가방.장비 = [];
    const 맨몸 = w.능력 ? w.능력(c, "공격") : null;
    w.S.가방.장비.push({ id: 9001, 키: "철검", 누구: c.id, 등급: "일반", 옵션: [] });
    const 옵션없이 = w.능력 ? w.능력(c, "공격") : null;
    w.S.가방.장비 = [{ id: 9002, 키: "철검", 누구: c.id, 등급: "전설",
      옵션: 끄기 ? [] : [{ 글: "날카로운", 칸: "공격", 값: 7 }] }];
    const 옵션끼고 = w.능력 ? w.능력(c, "공격") : null;

    return { 등급셈, 칸셈, 뽑기수, 평균비: 옵션합 / Math.max(1, 뽑기수), 없는칸붙음,
      작은평균: Math.round(작은평균 * 10) / 10, 큰평균: Math.round(큰평균 * 10) / 10, 큰키,
      맨몸, 옵션없이, 옵션끼고 };
  }, 사보타주);

  const r = 본 as Record<string, any>;
  if (r.못잼) { console.log("못 잼:", r.못잼); process.exit(2); }
  console.log(`등급 500뽑기: ${JSON.stringify(r.등급셈)}`);
  console.log(`붙은 칸: ${JSON.stringify(r.칸셈)} · 없는 칸에 붙은 것 ${r.없는칸붙음}`);
  console.log(`옵션 크기: 철검 평균 ${r.작은평균} · ${r.큰키} 평균 ${r.큰평균}`);
  console.log(`공격: 맨몸 ${r.맨몸} → 철검 ${r.옵션없이} → 옵션 낀 철검 ${r.옵션끼고}`);

  const 등급수 = Object.keys(r.등급셈 ?? {}).length;
  const 판정: [string, boolean][] = [
    ["등급이 섞여 나온다(3가지 이상)", 등급수 >= 3],
    ["없는 칸에는 안 붙는다", r.없는칸붙음 === 0],
    ["값이 장비 크기를 따라간다", r.큰평균 > r.작은평균 * 3],
    ["**힘이 실제로 오른다**", typeof r.옵션끼고 === "number" && r.옵션끼고 > r.옵션없이],
  ];
  let 나쁨 = 0;
  console.log("");
  for (const [n, ok] of 판정) { if (!ok) 나쁨++; console.log(`${ok ? "맞음  " : "어긋남"} ${n}`); }
  if (사보타주) console.log("\n사보타주(옵션을 빈칸으로): 어긋남이 0 이면 **자가 힘을 안 보고 있다**.");
  process.exit(나쁨 === 0 ? 0 : 1);
} finally {
  await 창.browser.close().catch(() => {});
}
