/**
 * **WebGL 판이 진짜로 그리나** (228회차 10-01). 모델 0 · 값 0.
 *   npx tsx engine/work/webgl/자.mts
 *
 * 고리는 8바퀴를 돌고 `C05 가만히 둬도 화면이 바뀐다` 를 **틀림**으로 닫았다(맞음 5 · 모름 12).
 * 내가 예측에 적은 가장 무서운 자리가 **까만 화면**이었다 — 3D 는 행렬 한 칸이 틀리면 전부 안 보이고,
 * 고리는 "화면이 안 바뀐다" 만 볼 뿐 왜 그런지는 모른다.
 *
 * 그래서 직접 잰다: ① WebGL 로 켜졌나 ② 셰이더가 붙었나 ③ 화면에 **뭔가 그려졌나**(까만 화면이 아닌가)
 * ④ 가만히 둬도 바뀌나 ⑤ 초당 몇 장인가.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { openHeadless } from "../../../src/lib/video/headless";
import sharp from "sharp";

// 228회차 10-02: 폴더를 인자로 받는다 — 자리 비교는 여러 폴더를 **같은 자**로 재야 한다.
const 뿌리 = process.argv[2] ?? "engine/work/ceiling/게임webgl";
const 종류: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const 서버 = createServer((q, s) => {
  const 길 = normalize(join(뿌리, decodeURIComponent((q.url ?? "/").split("?")[0]))).split("\\").join("/");
  // **폴더면 index.html.** 확장자로 가리면 안 된다 — 폴더 이름에 점이 있으면(`gpt-5.6-luna-1`)
  // `extname` 이 ".6-luna-1" 을 내놔서 폴더를 파일로 읽다 터진다(10-02 자리 비교에서 터졌다).
  const 폴더인가 = existsSync(길) && statSync(길).isDirectory();
  const f = 폴더인가 || !extname(길) ? join(길.startsWith(뿌리) ? 길 : 뿌리, "index.html") : 길;
  if (!f.split("\\").join("/").startsWith(뿌리) || !existsSync(f)) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { "content-type": 종류[extname(f)] ?? "text/plain" }); s.end(readFileSync(f));
});
await new Promise<void>((r) => 서버.listen(0, "127.0.0.1", () => r()));
const 포트 = (서버.address() as { port: number }).port;

const 창 = await openHeadless({ width: 1280, height: 800 });
if (!창) { console.error("창을 못 띄웠다"); process.exit(1); }
const page = await 창.browser.newPage();
const 오류: string[] = [];
page.on("pageerror", (e) => 오류.push(String(e).slice(0, 120)));
// **favicon 404 는 게임의 잘못이 아니다.** 브라우저가 알아서 찾는 것이고, 우리 서버엔 없다.
// 10-02 자리 비교에서 이것 하나로 아스트라 판이 ⑤ 에서 헛되이 떨어졌다 — 자가 잡은 게 아니라 자가 만든 흠이었다.
// 글에는 주소가 안 들어 있다("Failed to load resource: … 404") — **어디서 난 말인지**(location)를 봐야 가린다.
const 헛소리 = (m: { text(): string; location(): { url?: string } }) => {
  const 어디 = m.location()?.url ?? "";
  return /favicon/i.test(어디) || /favicon/i.test(m.text());
};
page.on("console", (m) => { if (m.type() === "error" && !헛소리(m)) 오류.push(`${m.text().slice(0, 100)}${m.location()?.url ? ` [${String(m.location().url).slice(-40)}]` : ""}`); });
await page.setRequestInterception(true);
page.on("request", (r) => (r.url().includes(`127.0.0.1:${포트}`) ? r.continue() : r.abort()));
/**
 * **`networkidle0` 로 기다리지 않는다** (228회차 10-03).
 * 바깥 요청을 막아 둔 창에서는 끊긴 요청 때문에 "조용해짐" 이 영영 안 올 수 있다 —
 * 10-03 에 그래서 자가 30초를 매달리다 죽었다. **자가 매달리면 아무것도 못 잰다.**
 * 글이 붙은 뒤 잠깐 기다리는 쪽이 더 튼튼하고, 어차피 아래에서 몇 초를 더 본다.
 */
await page.goto(`http://127.0.0.1:${포트}/`, { waitUntil: "domcontentloaded", timeout: 20000 });
const 쉼 = (ms: number) => new Promise((r) => setTimeout(r, ms));
await 쉼(1800);

const 재 = (n: string, ok: boolean | null, 본: string) =>
  console.log(`${ok === true ? "맞음  " : ok === false ? "어긋남" : "못 잼 "} ${n}\n        ${본}`);

// ① WebGL 로 켜졌나 — 창 안에서 직접 물어본다
const 바탕 = await page.evaluate(() => {
  const c = document.querySelector("canvas") as HTMLCanvasElement | null;
  if (!c) return { 있나: false, 종류: "캔버스 없음", w: 0, h: 0 };
  const g2 = c.getContext("webgl2"), g1 = g2 ? null : c.getContext("webgl");
  return { 있나: true, 종류: g2 ? "webgl2" : g1 ? "webgl" : "2d(또는 못 켬)", w: c.width, h: c.height };
});
재("① WebGL 로 그린다", 바탕.있나 && 바탕.종류.startsWith("webgl"), `캔버스 ${바탕.w}x${바탕.h} · ${바탕.종류}`);

// 시작 단추를 누른다(글자로 찾는다 — id 를 모른다)
const 눌림 = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button, a[href], [role=button]")]
    .find((e) => /시작|start|play/i.test(e.textContent ?? "") && (e as HTMLElement).offsetParent !== null);
  if (!b) return "(시작 단추 못 찾음)";
  (b as HTMLElement).click();
  return (b.textContent ?? "").trim().slice(0, 20);
});
await 쉼(1500);

/**
 * 화면이 **까맣지 않은가** — **화면 사진**을 읽어 센다.
 *
 * ## 10-02: 여기가 틀려 있었다
 * 전에는 `gl.readPixels` 로 캔버스를 읽었다. 그런데 WebGL 은 `preserveDrawingBuffer: true` 없이
 * **프레임 밖에서 읽으면 그리는 버퍼가 이미 비워져 있어 늘 까맣게 나온다.** 게임이 멀쩡히 돌아도 그렇다.
 * 10-02 자리 비교에서 아스트라 판을 "까만 화면" 으로 적었는데 **화면 사진에는 별·적·HUD 가 다 있었다.**
 * 그러니 어제 WebGL 천장 시험에서 고리가 8바퀴를 돌며 못 고친 "까만 화면" 도 **이 자의 흠**일 수 있다.
 *
 * 사진은 브라우저가 합성한 **사람이 보는 그대로**다. 자가 사람보다 덜 보면 그건 자가 아니다.
 */
const 그림 = async () => {
  const buf = await page.screenshot({ type: "png" });
  const { data, info } = await sharp(Buffer.from(buf)).resize(320, 200, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const 칸 = info.channels;
  const 본색 = new Set<number>();
  let 밝은점 = 0, 지문 = 0;
  for (let i = 0; i < data.length; i += 칸) {
    const v = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    본색.add(v);
    if (data[i] + data[i + 1] + data[i + 2] > 90) 밝은점++;
    지문 = (지문 * 31 + data[i] + data[i + 2]) >>> 0;
  }
  return { 색: 본색.size, 지문, 밝은점 };
};

const a = await 그림();
재("② 까만 화면이 아니다", a.색 > 3 && a.밝은점 > 20, `'${눌림}' 누른 뒤 · 서로 다른 색 ${a.색}가지 · 밝은 점 ${a.밝은점}개`);

// ③ 가만히 둬도 바뀌나
const 지문들: number[] = [];
for (let i = 0; i < 8; i++) { 지문들.push((await 그림()).지문); await 쉼(350); }
const 다른것 = new Set(지문들).size;
재("③ 가만히 둬도 화면이 바뀐다 (고리는 여기를 '틀림' 이라 적었다)", 다른것 >= 4, `2.8초에 서로 다른 그림 ${다른것}/8`);

// ④ 초당 몇 장
// **글자 그대로 보낸다.** 화살표 함수에 이름을 붙이면 esbuild 가 `__name(...)` 을 끼워 넣는데
// 창 안엔 그런 게 없어 통째로 죽는다(오늘만 네 번째다). 글은 esbuild 를 안 지난다.
const fps = await page.evaluate(
  "new Promise((done)=>{let n=0;const t0=performance.now();" +
  "const step=()=>{n++;if(performance.now()-t0<2000)requestAnimationFrame(step);" +
  "else done(Math.round(n*1000/(performance.now()-t0)));};requestAnimationFrame(step);})",
) as number;
재("④ 초당 50장 이상", fps >= 50, `${fps}장/초`);
재("⑤ 오류 없이 돈다", 오류.length === 0, 오류.length ? 오류.slice(0, 3).join(" / ") : "창 오류 0");

const 칸 = "C:/Users/az518/Desktop/로키-webgl-사진";
mkdirSync(칸, { recursive: true });
// 사진은 **잰 폴더 이름으로** 남긴다 — 한 이름에 덮어쓰면 두 판을 나란히 못 본다.
const 이름 = 뿌리.split("/").pop() || "화면";
writeFileSync(`${칸}/${이름}.png`, await page.screenshot({ type: "png" }));
console.log(`\n→ ${칸}/${이름}.png`);
await 창.close(); 서버.close();
