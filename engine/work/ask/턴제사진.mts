/**
 * **전투 장면을 찍는다** (10-07). 빛이 실제로 어떻게 보이는지 사장님께 보여 드리는 용도. 모델 0 · 값 0.
 *   npx tsx engine/work/ask/턴제사진.mts
 * 네 역할을 세우고 보호막 보스 앞에서 한 박자씩 돌리며, 빛이 터지는 순간을 찍어 한 장으로 붙인다.
 */
import sharp from "sharp";
import { readFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { openHeadless } from "../../../src/lib/video/headless";

const 뿌리 = "C:/Users/az518/Desktop/로키-길드턴제";
const 나올 = "C:/Users/az518/Desktop/로키-턴제-사진";
mkdirSync(나올, { recursive: true });
const 종류: Record<string, string> = { ".html":"text/html", ".png":"image/png", ".json":"application/json" };
const 서버 = createServer((q, s) => {
  const 길 = normalize(join(뿌리, decodeURIComponent((q.url ?? "/").split("?")[0]))).split("\\").join("/");
  const f = (existsSync(길) && statSync(길).isDirectory()) || !extname(길) ? join(뿌리, "index.html") : 길;
  if (!existsSync(f)) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { "content-type": 종류[extname(f)] ?? "text/plain" }); s.end(readFileSync(f));
});
await new Promise<void>((r) => 서버.listen(0, "127.0.0.1", () => r()));
const 포트 = (서버.address() as { port: number }).port;

const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) { console.error("창을 못 띄웠다"); process.exit(1); }
try {
  const page = await 창.browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(`http://127.0.0.1:${포트}/`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await new Promise((r) => setTimeout(r, 2500));
  const 길드 = Buffer.from(await page.screenshot());           // 켜면 바로 보이는 길드(야영지)
  await page.evaluate(() => {
    const w = window as any;
    for (let i = 1; i < 9999; i++) clearInterval(i);
    (document.querySelector('.tab[data-t="run"]') as HTMLElement).click();
    const 넷 = ["기사","검사","회복술사","흑마법사"].map((k) => w.S.대원.find((c: any) => c.키 === k) ?? (() => { const c = w.대원만들기(k, 30); w.S.대원.push(c); return c; })());
    for (const c of 넷) c.레벨 = 30;
    w.S.파티 = 넷.map((c: any) => c.id); w.S.쉼 = 0; w.S.층 = 40; w.S.단계 = 4;
    w.적만들기();
    for (const c of 넷) { c.hp = Math.floor(w.최대체력(c) * 0.6); c.궁 = 60; }
  });

  // 장면이 바뀐 직후(빛이 막 터진 때)를 찍는다 — 빛 종류가 새로 셌을 때만 남긴다
  const 장들: Buffer[] = [];
  const 본: string[] = [];
  for (let i = 0; i < 70 && 장들.length < 8; i++) {
    const 앞 = await page.evaluate(() => JSON.stringify((window as any).빛셈));
    await page.evaluate(() => (window as any).한턴());
    const 뒤 = await page.evaluate(() => JSON.stringify((window as any).빛셈));
    if (앞 === 뒤) { await new Promise((r) => setTimeout(r, 60)); continue; }
    const 새 = Object.keys(JSON.parse(뒤)).find((k) => JSON.parse(뒤)[k] !== (JSON.parse(앞)[k] ?? 0)) ?? "?";
    if (본.filter((x) => x === 새).length >= 2) { await new Promise((r) => setTimeout(r, 400)); continue; }
    await new Promise((r) => setTimeout(r, 170));          // 빛이 퍼진 순간
    장들.push(Buffer.from(await page.screenshot({ clip: { x: 0, y: 0, width: 390, height: 330 } })));
    본.push(새);
    await new Promise((r) => setTimeout(r, 400));
  }
  const W = 780, H = 660, 열 = 2, 행 = Math.ceil(장들.length / 열);
  await sharp({ create: { width: W * 열 + 12 * (열 + 1), height: H * 행 + 12 * (행 + 1), channels: 4, background: "#0b0e13" } })
    .composite(장들.map((b, i) => ({ input: b, left: 12 + (i % 열) * (W + 12), top: 12 + Math.floor(i / 열) * (H + 12) })))
    .png().toFile(`${나올}/빛-모음.png`);
  console.log(`${장들.length}장 — ${본.join(" · ")} → ${나올}/빛-모음.png`);
  const 전투 = Buffer.from(await page.screenshot());
  await sharp({ create: { width: 780*2 + 36, height: 1688 + 24, channels: 4, background: "#0b0e13" } })
    .composite([{ input: 길드, left: 12, top: 12 }, { input: 전투, left: 780 + 24, top: 12 }])
    .png().toFile(`${나올}/화면-새엔진.png`);
  console.log(`길드 · 전투 → ${나올}/화면-새엔진.png`);
  // 공방 칸 (10-07)
  await page.evaluate(() => {
    const w = window as any;
    w.S.최고층 = 10; w.S.금화 = 5200; Object.assign(w.S.가방, { 파편:31, 잔혼:14, 수호핵:1 });
    w.만들기("가죽갑옷"); w.장착(w.S.가방.장비[0].id, w.S.대원[0].id);
    (document.querySelector('.tab[data-t="forge"]') as HTMLElement).click();
  });
  await new Promise((r) => setTimeout(r, 400));
  const 대장간 = Buffer.from(await page.screenshot());
  await page.evaluate(() => { const w = window as any; w.만들기("철검"); w.S.가방.약 = 2;
    (document.querySelector('.tab[data-t="crew"]') as HTMLElement).click(); });
  await new Promise((r) => setTimeout(r, 400));
  const 캐릭터 = Buffer.from(await page.screenshot());
  await sharp({ create: { width: 780*2 + 36, height: 1688 + 24, channels: 4, background: "#0b0e13" } })
    .composite([{ input: 대장간, left: 12, top: 12 }, { input: 캐릭터, left: 780 + 24, top: 12 }]).png().toFile(`${나올}/섹션.png`);
  console.log(`대장간 · 캐릭터 → ${나올}/섹션.png`);
} finally {
  await 창.browser.close(); await 창.close?.(); 서버.close();
}
