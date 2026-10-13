/**
 * **잿빛 원정대 다국어 시험** (10-14, 사장님 "전세계화해줘 내앱"). 모델 0 · 값 0.
 *   npx tsx engine/tools/ash_다국어_시험.mts            # public/ash 를 이 컴퓨터에서 띄워 본다
 *   ASH_DIR=다른/폴더 npx tsx engine/tools/ash_다국어_시험.mts
 *
 * 세 언어(?lang=ko|en|ja)로 열고, 화면을 차례로 다 열어 본다 — 길드·캐릭터(장비/강화/기술)·대장간·시장·가방(네 탭)·
 * 물건 창·소환·출석·식당·우편·공지·설정·관문·출발 창·탑 지도, 그리고 전투 200턴(보스 층 포함).
 * 재는 것: ① 스크립트 오류 0 ② 영어·일본어 화면에 **한글이 한 글자도 없다** ③ 한국어 화면엔 한글이 있다(옮김이 한국어를 덮지 않았다).
 * 한글이 남으면 그 글을 보여 준다 — 사전에 빠진 이름이거나 말() 로 안 감싼 문장이다.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import puppeteer from "puppeteer-core";

const 폴더 = process.env.ASH_DIR ?? "public";
const 크롬 = process.env.CHROME ?? ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/usr/bin/chromium", "/usr/bin/google-chrome"].find((p) => existsSync(p));
if (!크롬) { console.error("크롬을 못 찾았다 — CHROME=경로"); process.exit(1); }
const 꼴: Record<string, string> = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".json": "application/json", ".mp3": "audio/mpeg", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };
const 서버 = createServer((q, r) => {
  const 길 = join(폴더, decodeURIComponent((q.url ?? "/").split("?")[0]));
  if (!existsSync(길) || statSync(길).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { "content-type": 꼴[extname(길)] ?? "application/octet-stream" }); r.end(readFileSync(길));
}).listen(0);
const 포트 = (서버.address() as { port: number }).port;

const 브 = await puppeteer.launch({ executablePath: 크롬, headless: true, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
let 실패 = 0;
for (const 언어 of ["ko", "en", "ja"] as const) {
  const 쪽 = await 브.newPage();
  // 같은 씨앗의 난수 — 돌릴 때마다 같은 전투가 나와야 한국어 판을 옛 판과 글자 그대로 맞대 볼 수 있다
  await 쪽.evaluateOnNewDocument(`(() => { let x = 12345; Math.random = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648); window.requestAnimationFrame = () => 0; })()`);
  // ↑ 그림 돌기(requestAnimationFrame)는 멈춘다 — 불꽃 알갱이가 프레임마다 난수를 먹어서, 멈추지 않으면 같은 씨앗이어도 전투가 갈린다.
  await 쪽.setViewport({ width: 390, height: 844 });
  const 오류: string[] = [];
  쪽.on("pageerror", (e) => 오류.push(String(e)));
  쪽.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|404/.test(m.text())) 오류.push(m.text()); });
  await 쪽.goto(`http://127.0.0.1:${포트}/ash/index.html?lang=${언어}`, { waitUntil: "load", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 3000));   // 그림이 다 들어온 뒤에 — 몹 그림(2번 그림)이 들어왔는지에 따라 난수를 먹는 수가 달라진다
  // 화면을 차례로 열며 보이는 글을 모은다
  // 화면 안에서 돌 코드는 **글로** 넘긴다 — tsx 가 함수에 __name 을 끼워 넣어 브라우저에서 터진다.
  const 글들 = (await 쪽.evaluate(`(async () => {
    const w = window;
    const 모음 = [];
    const 뜸 = () => { 모음.push(document.body.innerText); document.querySelectorAll("[title],[aria-label],[alt]").forEach((e) => 모음.push((e.getAttribute("title") ?? "") + " " + (e.getAttribute("aria-label") ?? ""))); };
    const 닫기 = () => document.querySelectorAll("#덮개").forEach((d) => d.remove());
    const S = w.S;
    // 다 열린 상태로 — 대장간·장비·영혼석·재료가 다 보이게
    S.최고층 = 45; S.금화 = 99_999_999; S.가방.별가루 = 99_999;
    for (const k of Object.keys(w.재료이름)) S.가방[k] = 200;
    for (const k of Object.keys(w.영혼석표)) { S.영혼석.가진[k] = 1; }
    S.영혼석.낀액티브 = ["폭풍"]; S.영혼석.낀패시브 = "재기";
    for (const k of ["흑마법사", "전투사제", "성기사", "암살자"]) S.대원.push(w.대원만들기(k, 30));
    for (const k of Object.keys(w.레시피)) if (w.레시피[k].슬롯 !== "약") S.가방.장비.push({ id: 900 + S.가방.장비.length, 키: k, 누구: null });
    S.가방.장비[0].누구 = S.대원[0].id; S.가방.약 = 3;
    // 탭마다
    for (const t of ["hall", "crew", "forge", "shop"]) { S.탭 = t; S.대장갈래 = null; S.시장갈래 = null; w.화면(); 뜸(); }
    S.탭 = "forge"; S.대장갈래 = "제작"; w.화면(); 뜸();
    S.탭 = "shop"; S.시장갈래 = "구매"; w.화면(); 뜸();
    S.탭 = "crew";
    for (const c of S.대원) for (const 탭 of ["장비", "강화", "기술"]) {
      S.보는대원 = c.id; S.대원탭 = 탭; S.가방슬롯 = 탭 === "장비" ? "무기" : null; w.화면(); 뜸();
      if (탭 === "기술") document.querySelectorAll("[data-풀이]").forEach((b) => { (b).click(); 뜸(); });
    }
    S.보는대원 = null;
    for (const 탭 of ["재료", "장비", "영혼석", "소모품"]) { S.가방탭 = 탭; w.가방창(); 뜸(); 닫기(); }
    w.물건창({ 종류: "재료", 키: "파편" }); 뜸(); 닫기();
    w.물건창({ 종류: "장비", id: S.가방.장비[0].id }); 뜸(); 닫기();
    w.물건창({ 종류: "소모품" }); 뜸(); 닫기();
    w.뽑기창(); 뜸(); (document.querySelector("#열번"))?.click(); 뜸(); 닫기();
    for (const id of ["#출석단추", "#출석단추", "#식당단추", "#mailBtn", "#공지단추", "#설정단추"]) { (document.querySelector(id)).click(); 뜸(); 닫기(); }
    (document.querySelector("#설정단추")).click(); (document.querySelector("#지우기단추")).click(); 뜸(); 닫기();
    S.탭 = "run"; S.진행 = false; w.화면(); w.맵그리기(); 뜸();
    w.출발창(10); 뜸(); 닫기(); w.출발창(3); 뜸(); 닫기();
    // 전투 — 일반 층과 보스 층(관문·보호막·전멸·승리)
    for (const 층 of [3, 10, 40]) {
      S.층 = 층; S.사냥층 = 층; S.진행 = true; w.전투준비(); w.적만들기();
      for (let i = 0; i < 120; i++) w.한턴();
      S.진행 = false;
      (document.querySelector("#자격버튼")).click(); 뜸(); 닫기();
      (document.querySelector("#자동버튼")).click(); (document.querySelector("#자동버튼")).click();
      뜸();
      document.querySelector("#log").innerHTML = "";
    }
    w.판끝(); w.전멸(); 뜸();
    return 모음;
  })()`)) as string[];
  const 모두 = 글들.join("\n");
  // 설정의 언어 단추는 각 언어를 **제 글자로** 적는다(한국어 · English · 日本語) — 그 한 줄만 뺀다.
  const 한글줄 = [...new Set(모두.split("\n").map((l) => l.trim()).filter((l) => /[가-힣]/.test(l) && l !== "한국어"))];
  const 됨 = 언어 === "ko" ? 한글줄.length > 50 && 오류.length === 0 : 한글줄.length === 0 && 오류.length === 0;
  console.log(`${됨 ? "✅" : "❌"} ${언어}: 오류 ${오류.length} · 한글 남은 줄 ${언어 === "ko" ? `(한국어라 있어야 함) ${한글줄.length}` : 한글줄.length} · 모은 글 ${모두.length}자`);
  for (const e of 오류.slice(0, 5)) console.log("    오류:", e.slice(0, 200));
  if (언어 !== "ko") for (const l of 한글줄.slice(0, 25)) console.log("    한글:", l.slice(0, 140));
  if (!됨) 실패++;
  if (process.env.ASH_DUMP) (await import("node:fs")).writeFileSync(`${process.env.ASH_DUMP}-${언어}.txt`, 모두);
  await 쪽.close();
}
await 브.close(); 서버.close();
console.log(실패 ? `\n${실패}개 언어 실패` : "\n세 언어 모두 통과");
process.exit(실패 ? 1 : 0);
