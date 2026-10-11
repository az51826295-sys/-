/**
 * **장비 값이 벌 수 있는 돈인가** (10-11). 모델 0 · 값 0.
 *   ASH_URL=http://127.0.0.1:8124/ash/index.html npx tsx engine/tools/ash_금화곡선.mts [--sabotage]
 *
 * 10-11: 레시피 금화를 티어마다 ×5 로 올려 뒀는데, 벌이는 직선이었다 —
 * **100층까지 전부 모아도 170만인데 T10 한 벌이 12억**이었다.
 * 그러면 벽이 "재료와 보스"가 아니라 **돈**이 되는데, 그건 설계가 아니다.
 * (그리고 막힘 자는 금화를 넉넉히 쥐여 주므로 이걸 영영 못 본다 — 그래서 자가 따로 있어야 한다.)
 *
 * **무엇에 견주나.** "최소로 깨고 지나갈 때 쌓이는 돈"이 아니라
 * **그 티어 재료를 모으는 동안 버는 돈**이다. 재료가 35% 로 1~2개씩 떨어지므로
 * 한 티어를 채우려면 그 층대를 120판쯤 돈다 — 그동안 버는 돈이 살 수 있는 돈이다.
 *
 * 금화 식은 **베껴 적지 않는다.** 게임의 `금화보상()` 을 그대로 부른다
 * (베껴 적으면 게임이 바뀌어도 이 자는 옛 식을 계속 맞다고 한다 — 10-11에 실제로 그랬다).
 */
import { openHeadless } from "../../src/lib/video/headless";
import { 이름헬퍼 } from "./ash_공통.mjs";
const 주소 = process.env.ASH_URL ?? "https://rookery-web-production.up.railway.app/ash/index.html";
/** 한 티어 재료를 채우는 데 드는 판 수 — 재료가 35% 로 1~2개씩이고 60~160개가 필요하다 */
const 재료판 = 120;
/** 한 벌(무기+갑옷)이 그 돈의 몇 할까지면 되는가. 1.0 이면 딱 빠듯, 0.8 이면 조금 남는다 */
const 몫한도 = 0.8;

const 창 = await openHeadless({ width: 390, height: 844, protocolTimeout: 10 * 60_000 });
if (!창) process.exit(1);
let 나쁨 = 0;
try {
  const page = await 창.browser.newPage();
  await 이름헬퍼(page);
  await page.goto(주소, { waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 1800));

  const 본 = await page.evaluate((재료판: number) => {
    const w = window as any;
    for (let i = 1; i < 9999; i++) clearInterval(i);
    if (typeof w.금화보상 !== "function") return { 없다: true } as any;

    /** 열림 F 인 티어를 만들려면 F+1~F+9 층을 돈다 — 그동안 버는 돈 */
    const 벌이 = (F: number) => {
      let 합 = 0;
      for (let i = 0; i < 재료판; i++) 합 += w.금화보상(Math.min(100, F + 1 + (i % 9)), false);
      return Math.round(합);
    };
    const 층별: any[] = [];
    for (let f = 10; f <= 100; f += 10)
      층별.push({ 층: f, 한판: w.금화보상(f, false), 보스판: w.금화보상(f, true), 필요판: w.필요판(f) });

    /** 티어 = 열림이 같은 레시피 묶음. 약(슬롯 "약")은 한 벌에 안 든다 */
    const 티어 = new Map<number, { 합: number; 것들: string[] }>();
    for (const [k, r] of Object.entries(w.레시피) as any[]) {
      if (r.슬롯 === "약") continue;
      const t = 티어.get(r.열림) ?? { 합: 0, 것들: [] };
      t.합 += r.금화; t.것들.push(`${k} ${r.금화.toLocaleString()}`);
      티어.set(r.열림, t);
    }
    return {
      층별,
      티어: [...티어.entries()].sort((a, b) => a[0] - b[0])
        .map(([열림, t]) => ({ 열림, 합: t.합, 것들: t.것들, 벌이: 벌이(열림) })),
    };
  }, 재료판);

  if ((본 as any).없다) { console.log("실패 게임에 금화보상() 이 없다 — 자가 볼 것이 없다"); process.exit(1); }

  console.log("  층     한 판        보스 판    필요판");
  for (const r of 본.층별)
    console.log(`${String(r.층).padStart(4)} ${r.한판.toLocaleString().padStart(11)} ${r.보스판.toLocaleString().padStart(13)} ${String(r.필요판).padStart(8)}`);

  console.log(`\n 열림   한 벌 값          ${재료판}판 벌이        몫`);
  for (const t of 본.티어) {
    const 몫 = t.합 / Math.max(1, t.벌이);
    const 나쁜 = 몫 > 몫한도;
    if (나쁜) 나쁨++;
    console.log(`${String(t.열림).padStart(5)} ${t.합.toLocaleString().padStart(14)} ${t.벌이.toLocaleString().padStart(16)} ${`${(몫 * 100).toFixed(0)}%`.padStart(8)}`
      + (나쁜 ? "  ← 못 산다" : ""));
  }
  if (process.argv.includes("--sabotage")) {
    /* 심은 고장: 값을 백 배로. 자가 입을 다물면 자가 고장 난 것이다.
       (×10 으로는 **앞 티어 둘이 안 걸린다** — 1·5층 것은 벌이의 4% 라 열 배여도 40% 다.
        그건 자의 고장이 아니라 값이 정말 싼 것이다. 그래서 이빨 시험은 ×100 으로 한다.) */
    console.log("\n[--sabotage] 모든 값을 ×100 해서 다시 센다");
    let 잡음 = 0;
    for (const t of 본.티어) if (t.합 * 100 / Math.max(1, t.벌이) > 몫한도) 잡음++;
    console.log(잡음 === 본.티어.length ? `통과 ×100 하면 ${잡음}개 전부 걸린다(자에 이빨이 있다)` : `실패 ×100 인데 ${잡음}/${본.티어.length}만 걸린다`);
    if (잡음 !== 본.티어.length) 나쁨++;
  }
  console.log(나쁨 === 0 ? "\n전부 통과 — 값이 버는 돈 안에 있다." : `\n실패 ${나쁨}건`);
} finally { await 창.browser.close(); await 창.close?.(); }
process.exit(나쁨 === 0 ? 0 : 1);
