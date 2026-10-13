/**
 * **잿빛 음악이 실제로 도는가** (10-09). 모델 0 · 값 0.
 *   ASH_URL='http://127.0.0.1:8123/ash/index.html?lang=ko' npx tsx engine/tools/ash_snd_check.mts
 *
 * "넣었다" 는 코드가 있다는 뜻이고, 자는 **소리가 흐르는지**를 본다.
 * 브라우저는 사람이 건드리기 전에 소리를 막는다 — 그래서 손길을 흉내 내고(클릭) 그 뒤를 잰다.
 * currentTime 이 흐르는지, 끄면 멈추는지, 다시 켜면 이어지는지.
 */
import { openHeadless } from "../../src/lib/video/headless";
import { 이름헬퍼 } from "./ash_공통.mjs";

const 주소 = process.env.ASH_URL ?? "https://rookery-web-production.up.railway.app/ash/index.html?lang=ko";
let 나쁨 = 0;
const 재기 = (이름: string, 괜찮: boolean, 본것?: unknown) => {
  if (!괜찮) 나쁨++;
  console.log(괜찮 ? "통과" : "실패", 이름, 괜찮 ? "" : JSON.stringify(본것));
};

const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) { console.error("창을 못 띄웠다"); process.exit(1); }
try {
  const page = await 창.browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await 이름헬퍼(page);
  await page.goto(주소, { waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 1500));

  재기("소리 단추가 있다", await page.$("#sndBtn") !== null);

  // 손길 흉내 — 단추가 아닌 빈 곳을 눌러 "첫 손길" 만 준다
  await page.mouse.click(195, 700);
  await new Promise((r) => setTimeout(r, 2500));

  const 흐름 = await page.evaluate(() => {
    const 소리 = document.querySelector("audio") as HTMLAudioElement | null;
    return 소리 ? { 멈춤: 소리.paused, 때: 소리.currentTime, 소리크기: 소리.volume, 반복: 소리.loop } : null;
  });
  재기("음악 요소를 찾았다", 흐름 !== null, 흐름);
  재기("첫 손길 뒤 흐른다", !!흐름 && !흐름.멈춤 && 흐름.때 > 0.2, 흐름);
  재기("반복으로 걸려 있다", !!흐름?.반복, 흐름);
  재기("소리가 너무 크지 않다", !!흐름 && 흐름.소리크기 <= .6, 흐름?.소리크기);

  // 끄기
  await page.click("#sndBtn");
  await new Promise((r) => setTimeout(r, 900));
  const 끈뒤 = await page.evaluate(() => {
    const a = document.querySelector("audio") as HTMLAudioElement | null;
    return a ? { 멈춤: a.paused, 기억: localStorage.getItem("ash-snd") } : null;
  });
  재기("끄면 멈춘다", !!끈뒤?.멈춤, 끈뒤);
  재기("끈 것을 기억한다", 끈뒤?.기억 === "off", 끈뒤);

  // 다시 켜기
  await page.click("#sndBtn");
  await new Promise((r) => setTimeout(r, 1500));
  const 켠뒤 = await page.evaluate(() => {
    const a = document.querySelector("audio") as HTMLAudioElement | null;
    return a ? { 멈춤: a.paused, 때: a.currentTime } : null;
  });
  재기("다시 켜면 이어진다", !!켠뒤 && !켠뒤.멈춤, 켠뒤);
} finally {
  await 창.browser.close(); await 창.close?.();
}
console.log(나쁨 === 0 ? "\n전부 통과" : `\n실패 ${나쁨}건`);
process.exit(나쁨 === 0 ? 0 : 1);
