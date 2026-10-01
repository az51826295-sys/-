/**
 * **7판의 'c14 업그레이드 안 됨' 이 진짜인가** (228회차 09-30). 모델 0 · 값 0.
 *   npx tsx engine/work/ceiling/자7.mts
 *
 * 심판이 적은 이유: *"업그레이드 버튼을 눌렀지만 towerLevel 1, towerDamage 18, towerRange 125 가 그대로"*.
 * 그런데 그때 **돈 자취가 150→100→50→80** 이고 업그레이드 값은 **75** 였다 — 누를 때 돈이 모자랐을 수 있다.
 * 돈이 모자라 거절된 것을 "고장" 으로 적으면 그건 틀린 틀림이다. 그래서 **돈을 넉넉히 두고** 다시 해 본다.
 *
 * 길: (-30,210)→(270,210)→(270,450)→(870,450)→(930,450) · 캔버스 900x600
 */
import { readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { openHeadless } from "../../../src/lib/video/headless";

const 뿌리 = "engine/work/ceiling/게임7";
const 종류: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const 서버 = createServer((req, res) => {
  const 길 = normalize(join(뿌리, decodeURIComponent((req.url ?? "/").split("?")[0]))).split("\\").join("/");
  const 파일 = !extname(길) ? join(뿌리, "index.html") : 길;
  if (!파일.split("\\").join("/").startsWith(뿌리) || !existsSync(파일)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": 종류[extname(파일)] ?? "text/plain" });
  res.end(readFileSync(파일));
});
await new Promise<void>((r) => 서버.listen(0, "127.0.0.1", () => r()));
const 포트 = (서버.address() as { port: number }).port;
const 창 = await openHeadless({ width: 1360, height: 920 });
if (!창) process.exit(1);
const page = await 창.browser.newPage();
await page.setRequestInterception(true);
page.on("request", (r) => (r.url().includes(`127.0.0.1:${포트}`) ? r.continue() : r.abort()));
await page.goto(`http://127.0.0.1:${포트}/`, { waitUntil: "networkidle0" });
const 쉼 = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 창 안에서 이름 붙인 함수를 만들면 `__name` 때문에 통째로 죽는다 — 오늘만 세 번째다. 전부 제자리에 편다.
const 상태 = () => page.evaluate(() => {
  const 글들 = ["moneyValue", "livesValue", "towerLevel", "towerDamage", "towerRange", "upgradeButton", "message"]
    .map((id) => (document.getElementById(id)?.textContent ?? "").trim());
  return {
    돈: Number(글들[0].replace(/[^0-9-]/g, "") || "-1"),
    목숨: Number(글들[1].replace(/[^0-9-]/g, "") || "-1"),
    급: 글들[2], 공격: 글들[3], 사거리: 글들[4], 업단추: 글들[5], 말: 글들[6].slice(0, 50),
  };
});
const 캔버스누르기 = async (x: number, y: number) => {
  const r = await page.evaluate(() => { const c = document.getElementById("gameCanvas")!.getBoundingClientRect(); return { l: c.left, t: c.top, w: c.width, h: c.height }; });
  await page.mouse.click(r.l + (x * r.w) / 900, r.t + (y * r.h) / 600);
  await 쉼(200);
};

await page.click("#startButton"); await 쉼(600);
console.log("시작 직후 :", JSON.stringify(await 상태()));

// 길 옆에 타워 하나. (270,210)~(270,450) 세로 구간 옆.
await 캔버스누르기(200, 300);
console.log("타워 놓음 :", JSON.stringify(await 상태()));

// **돈이 쌓일 때까지 기다린다** — 적을 잡으면 보상이 들어온다. 업그레이드 값은 75.
let 앞 = await 상태();
for (let i = 0; i < 60 && 앞.돈 < 160; i++) { await 쉼(800); 앞 = await 상태(); if (앞.목숨 <= 0) break; }
console.log("돈 모인 뒤:", JSON.stringify(앞));

// 타워를 누르고 업그레이드
await 캔버스누르기(200, 300);
const 고르고 = await 상태();
console.log("타워 누름 :", JSON.stringify(고르고));
const 눌림 = await page.evaluate(() => {
  const b = document.getElementById("upgradeButton") as HTMLButtonElement | null;
  if (!b) return "단추 없음";
  if (b.disabled) return "단추가 막혀 있음";
  b.click(); return "눌렀음";
});
await 쉼(500);
const 뒤 = await 상태();
console.log("업글 뒤   :", JSON.stringify(뒤), `· ${눌림}`);

const 올랐나 = 뒤.급 !== 고르고.급 || 뒤.공격 !== 고르고.공격 || 뒤.사거리 !== 고르고.사거리;
const 돈줆 = 뒤.돈 < 고르고.돈;
console.log("");
console.log(`${올랐나 && 돈줆 ? "맞음  " : "어긋남"} c14 업그레이드하면 돈이 줄고 공격·사거리가 오른다`);
console.log(`       급 ${고르고.급}→${뒤.급} · 공격 ${고르고.공격}→${뒤.공격} · 사거리 ${고르고.사거리}→${뒤.사거리} · 돈 ${고르고.돈}→${뒤.돈}`);
console.log(`       (심판은 **틀림**이라 적었다. 그때 돈은 50, 업그레이드 값은 75였다)`);
await 창.close(); 서버.close();
