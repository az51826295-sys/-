/**
 * **메뉴형 경영 게임이 진짜로 도나** (228회차 10-03). 모델 0 · 값 0.
 *   npx tsx engine/work/ask/메뉴게임자.mts [폴더]
 *
 * ## 왜 새 자인가
 * 이 판은 WebGL 자(`engine/work/webgl/자.mts`)로 쟀더니 ① 이 바로 어긋남이었다 — 캔버스가 없으니까.
 * 당연하다. 사장님이 베끼라고 준 것은 **메뉴와 목록으로 된 2D 경영 게임**이다. 캔버스가 없는 게 맞다.
 * 안 맞는 자로 재면 **멀쩡한 것이 떨어지고**, 09-30 에 그 때문에 멀쩡한 코드를 세 바퀴 고치게 했다.
 *
 * ## 이 자가 묻는 것
 * 사진 16장에서 뽑은 기준의 **뼈대**만 묻는다. 전부는 안 묻는다 — 못 묻는 것은 '못 잼' 으로 적는다.
 *   ① 아래 탭 넷이 다 있나        ② 탭마다 **다른 화면**이 나오나
 *   ③ 건물을 누르면 팝업이 뜨나   ④ 올리기 단추가 **숫자를 바꾸나**
 *   ⑤ 전투가 **가만히 둬도** 도나  ⑥ 층수가 **스스로** 오르나   ⑦ 오류 없이 도나
 *
 * ⑥ 이 알맹이다. 사장님이 전투를 「오늘도 환생」이라 하신 까닭은 **방치**다 —
 * 안 보고 있어도 층이 오르는 것. 그게 안 되면 나머지가 다 돌아도 그 게임이 아니다.
 */
import { readFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { openHeadless } from "../../../src/lib/video/headless";

const 뿌리 = (process.argv[2] ?? "engine/work/ask/모방게임-gpt-5.6-luna").split("\\").join("/");
const 사진칸 = "C:/Users/az518/Desktop/로키-메뉴게임-사진";
mkdirSync(사진칸, { recursive: true });

const 종류: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const 서버 = createServer((q, s) => {
  const 길 = normalize(join(뿌리, decodeURIComponent((q.url ?? "/").split("?")[0]))).split("\\").join("/");
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
page.on("pageerror", (e) => 오류.push(String(e).slice(0, 140)));
const 헛소리 = (m: { text(): string; location(): { url?: string } }) =>
  /favicon/i.test(m.location()?.url ?? "") || /favicon/i.test(m.text());
page.on("console", (m) => { if (m.type() === "error" && !헛소리(m)) 오류.push(m.text().slice(0, 120)); });
/**
 * **묻는 창(confirm)을 받아 준다.** 환생은 실수로 날리면 안 되니 되묻는 게 맞는데,
 * 받아 주는 사람이 없으면 창이 멈춰 선다 — 10-03 에 자가 거기서 통째로 죽었다(ProtocolError).
 * 자가 멈추면 아무것도 못 잰다. 묻는 창은 **늘 예**로 받는다.
 */
page.on("dialog", (d) => { 물은창.push(d.message().slice(0, 80)); d.accept().catch(() => {}); });
const 물은창: string[] = [];

await page.setRequestInterception(true);
page.on("request", (r) => (r.url().includes(`127.0.0.1:${포트}`) ? r.continue() : r.abort()));
await page.goto(`http://127.0.0.1:${포트}/`, { waitUntil: "domcontentloaded", timeout: 20000 });
const 쉼 = (ms: number) => new Promise((r) => setTimeout(r, ms));
await 쉼(1500);

const 잰것: [string, boolean | null, string][] = [];
const 재 = (n: string, ok: boolean | null, 본: string) => { 잰것.push([n, ok, 본]); console.log(`${ok === true ? "맞음  " : ok === false ? "**어긋남**" : "못 잼 "} ${n}\n        ${본}`); };

/**
 * 글자로 누른다 — id 를 모르니까. 가장 **안쪽** 것을 누른다(바깥 상자를 누르면 엉뚱한 게 눌린다).
 *
 * 10-03 첫 판에서 이 자가 통째로 헛돌았다: `"본부"` 를 누르랬더니 **제목 글씨**("본부 성장하는 모험가의 집")
 * 를 눌렀고, 화면이 안 바뀌니 그 뒤 검사가 전부 "못 찾았다" 로 떨어졌다. **게임이 아니라 자가 틀렸다.**
 * 그래서 `아래칸` 을 붙인다 — 탭은 **화면 아래쪽에 있는 짧은 글자**라는 것까지 같이 말해 준다.
 */
async function 누르기(글: string, 아래칸 = false): Promise<boolean> {
  const 됐나 = await page.evaluate((글, 아래칸) => {
    // 창 안에서는 **이름 붙은 함수를 만들지 않는다** — tsx 가 `__name(...)` 을 끼워 넣는데
    // 그 도우미는 창 안에 없어서 `__name is not defined` 로 죽는다(10-03 에 겪음).
    let 들 = [...document.querySelectorAll<HTMLElement>("button,[role=button],a,div,li,span")]
      .filter((e) => (e.textContent ?? "").trim().includes(글) && e.offsetParent !== null && e.getBoundingClientRect().width > 0);
    if (아래칸) {
      // 탭: 아래 20% 안에 있고, 글자가 짧은 것(제목·설명문이 아니라 **딱지**)
      들 = 들.filter((e) => e.getBoundingClientRect().top > innerHeight * 0.8 && (e.textContent ?? "").trim().length <= 6);
    }
    const 가장안쪽 = 들.filter((e) => !들.some((d) => d !== e && e.contains(d)));
    const t = 가장안쪽[0] ?? 들[들.length - 1];
    if (!t) return false;
    (t.closest("button,[role=button],a") as HTMLElement ?? t).click();
    return true;
  }, 글, 아래칸);
  await 쉼(600);
  return 됐나;
}
const 본글 = () => page.evaluate(() => (document.body.innerText ?? "").replace(/\s+/g, " ").trim());

// ① 아래 탭 넷
const 탭들 = ["본부", "모험가", "던전", "전투"];
const 있는탭 = await page.evaluate((탭들: string[]) => 탭들.filter((t) =>
  [...document.querySelectorAll<HTMLElement>("*")].some((e) => {
    const 글 = (e.textContent ?? "").trim();
    const r = e.getBoundingClientRect();
    // `=== t` 로 가리면 아이콘이 붙은 딱지를 못 본다(10-03). **아래쪽 짧은 글자**로 가린다.
    return 글.includes(t) && 글.length <= 6 && e.offsetParent !== null && r.top > innerHeight * 0.8;
  })), 탭들);
재("① 아래 탭 넷이 있나", 있는탭.length === 4, `${있는탭.join("·")} (${있는탭.length}/4)`);

// ② 탭마다 다른 화면
const 화면: Record<string, string> = {};
for (const t of 탭들) { if (await 누르기(t, true)) { 화면[t] = await 본글(); await page.screenshot({ path: `${사진칸}/${t}.png` }); } }
const 다른화면 = new Set(Object.values(화면).map((s) => s.slice(0, 400))).size;
재("② 탭마다 다른 화면이 나오나", Object.keys(화면).length === 4 ? 다른화면 === 4 : null,
  Object.keys(화면).length === 4 ? `서로 다른 화면 ${다른화면}/4` : `탭 ${Object.keys(화면).length}개만 눌려서 못 잰다`);

// ③ 건물을 누르면 팝업
await 누르기("본부", true);
const 본부앞 = (await 본글()).length;
const 열렸나 = await 누르기("선술집");
await 쉼(400);
const 본부뒤 = await 본글();
재("③ 건물을 누르면 팝업이 뜨나", 열렸나 ? 본부뒤.length > 본부앞 + 20 : null,
  열렸나 ? `글자 ${본부앞} → ${본부뒤.length}` : "'선술집' 을 못 찾아서 못 잰다");

// ④ 올리기 단추가 숫자를 바꾸나
const 올리기 = ["수용량 +1", "+1", "속도 +10%", "공간 +1"].find((g) => 본부뒤.includes(g));
let 바뀜 = null as boolean | null, 바뀜본 = "올리기 단추를 못 찾아서 못 잰다";
if (올리기) {
  const 앞 = 본부뒤; await 누르기(올리기); await 쉼(400);
  const 뒤 = await 본글();
  바뀜 = 앞 !== 뒤; 바뀜본 = `'${올리기}' 누름 · 글 ${앞 === 뒤 ? "그대로" : "바뀜"}`;
}
재("④ 올리기 단추가 숫자를 바꾸나", 바뀜, 바뀜본);

/**
 * ⑤⑥ 전투 — 가만히 둬도 도나, 층수가 스스로 오르나
 *
 * **화면을 새로 연다.** ③④ 가 띄운 선술집 팝업이 그대로 덮여 있었고, 그 위에서 전투를 쟀다(10-03 첫 판).
 * 09-25 에 같은 일을 겪었다 — **자는 서로의 흔적 위에서 재면 안 된다.**
 */
await page.reload({ waitUntil: "domcontentloaded", timeout: 20000 });
await 쉼(1500);
const 전투갔나 = await 누르기("전투", true);
let 돌았나 = null as boolean | null, 돈본 = "'전투' 탭을 못 찾아서 못 잰다";
let 층올랐나 = null as boolean | null, 층본 = "층수를 못 찾아서 못 잰다";
if (전투갔나) {
  await 쉼(600);
  const 층읽기 = async () => {
    const g = await 본글();
    const m = g.match(/(\d+)\s*층/) ?? g.match(/층\s*[:：]?\s*(\d+)/);
    return { 글: g, 층: m ? Number(m[1]) : null };
  };
  const a = await 층읽기();
  await page.screenshot({ path: `${사진칸}/전투-0초.png` });
  await 쉼(40000);                                   // **25초를 가만히 둔다** — 방치형인지는 이걸로만 안다
  const b = await 층읽기();
  await page.screenshot({ path: `${사진칸}/전투-끝.png` });
  돌았나 = a.글 !== b.글;
  돈본 = `40초 가만히 둠 · 화면 글 ${a.글 === b.글 ? "그대로" : "바뀜"}`
    + `
        앞: ${a.글.slice(0, 90)}
        뒤: ${b.글.slice(0, 90)}`;
  if (a.층 !== null && b.층 !== null) { 층올랐나 = b.층 > a.층; 층본 = `${a.층}층 → ${b.층}층 (40초)`; }
  else 층본 = `화면에서 "N층" 을 못 읽었다 (${a.글.slice(0, 70)}…)`;
}
재("⑤ 전투가 가만히 둬도 도나", 돌았나, 돈본);
재("⑥ 층수가 스스로 오르나 (방치형의 알맹이)", 층올랐나, 층본);

재("⑦ 오류 없이 도나", 오류.length === 0, 오류.length ? 오류.slice(0, 3).join(" | ") : "창 오류 0");

const 맞 = 잰것.filter((x) => x[1] === true).length, 어 = 잰것.filter((x) => x[1] === false).length, 못 = 잰것.filter((x) => x[1] === null).length;
console.log(`\n맞음 ${맞} · 어긋남 ${어} · 못 잼 ${못}  → 사진 ${사진칸}`);
await 창.browser.close(); await 창.close?.(); 서버.close();
if (어 > 0) process.exitCode = 1;
