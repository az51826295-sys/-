/**
 * **게임 장면 여러 장 → 만들 수 있는 기준** (228회차 10-02).
 *   npx tsx engine/tools/rookery_env.mts engine/work/ask/게임모방자.mts [게임폴더] [--진짜]
 *   (안 주면 오늘 아스트라가 만든 3D 우주 슈팅을 쓴다 — **답을 내가 아는 게임**이라야 자가 자다)
 *
 * 재는 것은 "말이 그럴듯한가" 가 아니다. **만들 수 있는 것이 나왔나**다:
 *   ① 기준이 10개 이상인가 (적으면 그건 감상문이다)
 *   ② 기준이 **확인할 수 있는 문장**인가 — when 과 then 이 둘 다 차 있고, then 에 **보이는 것**이 적혔나
 *   ③ 규칙을 **장면 사이의 차이**로 말했나 (한 장짜리 짐작이 아니라)
 *   ④ `못본것` 을 채웠나 — 소리·이야기는 장면으로 모른다
 *   ⑤ `안가져올것` 을 적었나 — 남의 캐릭터를 그대로 만들면 모방이 아니라 베끼기다
 *
 * 그리고 **내가 아는 답과 대 본다**: 아스트라 판에는 별·입체 적·레이저·점수·체력·웨이브가 있다.
 * 자가 그걸 못 짚으면 자가 아니라 눈이 없는 것이다.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { openHeadless } from "../../../src/lib/video/headless";

const 뿌리 = process.argv.find((a) => a.startsWith("engine/")) ?? "engine/work/3d-compare/gpt-6-astra-1";
const 진짜 = process.argv.includes("--진짜");
const 칸 = "C:/Users/az518/Desktop/로키-게임모방";
mkdirSync(칸, { recursive: true });

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

// ── 장면을 뜬다. **시간 차가 있어야** 규칙이 보인다 ──────────────────
const 창 = await openHeadless({ width: 1280, height: 800 });
if (!창) { console.error("창을 못 띄웠다"); process.exit(1); }
const page = await 창.browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.goto(`http://127.0.0.1:${포트}/`, { waitUntil: "networkidle0" });
// 시작 단추가 있으면 누른다 — 제목 화면만 다섯 장 떠서는 규칙이 안 보인다.
await page.evaluate(`(() => {
  const b = [...document.querySelectorAll("button, a[href], [role=button]")]
    .find((e) => /시작|start|play/i.test(e.textContent || "") && e.offsetParent !== null);
  if (b) b.click();
})()`);
await new Promise((r) => setTimeout(r, 1200));

const 장면: string[] = [];
for (let i = 0; i < 5; i++) {
  // **실제로 조작한다.** 가만히 보면 "저절로 변하는 것" 만 보이고 **내가 해서 변한 것**은 안 보인다 —
  // 10-02 첫 판에서 기준 13개 중 11개가 "~가 보인다" 였다. 그건 화면 설명이지 게임이 아니다.
  const 키 = (["KeyW", "KeyA", "KeyD", "ShiftLeft", "KeyW"] as const)[i];
  await page.keyboard.down(키);
  await page.mouse.move(640 + i * 90, 400 + (i % 2 ? 60 : -60));
  await page.mouse.down(); await new Promise((r) => setTimeout(r, 220)); await page.mouse.up();
  await page.keyboard.press("Space");
  await new Promise((r) => setTimeout(r, 700));
  await page.keyboard.up(키);
  await new Promise((r) => setTimeout(r, 250));
  const buf = Buffer.from(await page.screenshot({ type: "jpeg", quality: 68 }));
  writeFileSync(`${칸}/장면${i + 1}.jpg`, buf);
  장면.push(buf.toString("base64"));
}
await 창.close(); 서버.close();
console.log(`장면 ${장면.length}장 → ${칸}`);

type 결과 = {
  무엇: string; 화면칸: string[]; 조작: string; 규칙: string[]; 손맛: string; 그림결: string;
  기준: { id: string; when: string; then: string }[]; 안가져올것: string[]; 못본것: string[];
};

let r: 결과;
if (진짜) {
  const { 게임모방꼴, 게임모방지시문, 게임모방물음 } = await import("../../../src/lib/ask/게임모방");
  const { defaultProviders } = await import("../../../src/lib/execution/shared");
  const { meterProviders } = await import("../../../src/lib/costs/meter");
  const { createServiceClient } = await import("../../../src/lib/supabase/service");
  const db = createServiceClient();
  const { data: co } = await db.from("companies").select("id").eq("name", "권혁수").maybeSingle();
  const { ai } = meterProviders(defaultProviders(null), db, { companyId: (co as any).id, purpose: "game_copy" } as any);
  const { output } = await ai.generateStructuredOutput({
    systemInstructions: 게임모방지시문, input: 게임모방물음(장면.length), images: 장면,
    schema: 게임모방꼴, schemaName: "game_copy", maxTokens: 16000, tier: "judgment",
  });
  r = output as 결과;
} else {
  console.log("목(mock)은 그림을 못 본다 — 판정을 재려면 --진짜");
  process.exit(0);
}

console.log(`\n무엇: ${r.무엇}`);
console.log(`화면 칸: ${r.화면칸.join(" · ")}`);
console.log(`조작: ${r.조작}`);
console.log(`손맛: ${r.손맛}`);
console.log(`그림결: ${r.그림결}`);
console.log(`규칙:`); for (const x of r.규칙) console.log(`  · ${x}`);
console.log(`\n기준 ${r.기준.length}개:`); for (const c of r.기준) console.log(`  [${c.id}] ${c.when} → ${c.then}`);
console.log(`\n안 가져올 것:`); for (const x of r.안가져올것) console.log(`  ✗ ${x}`);
console.log(`못 본 것:`); for (const x of r.못본것) console.log(`  ? ${x}`);

// ── 자 ──────────────────────────────────────────────────────────
const 글 = JSON.stringify(r);
const 알맹이 = ["별", "적", "점수", "체력", "웨이브"];   // 내가 아는 답(아스트라 판)
const 짚은것 = 알맹이.filter((w) => 글.includes(w));
const 잼: [string, boolean, string][] = [
  ["① 기준이 10개 이상인가", r.기준.length >= 10, `${r.기준.length}개`],
  ["② 기준이 확인할 수 있는 문장인가", r.기준.every((c) => c.when.trim().length > 4 && c.then.trim().length > 6), `빈 칸 ${r.기준.filter((c) => !c.when.trim() || !c.then.trim()).length}개`],
  ["③ 규칙을 둘 이상 짚었나", r.규칙.length >= 2, `${r.규칙.length}개`],
  ["④ 못 본 것을 채웠나", r.못본것.length >= 1, `${r.못본것.length}개`],
  ["⑤ 안 가져올 것을 적었나", r.안가져올것.length >= 1, `${r.안가져올것.length}개`],
  ["⑥ 내가 아는 알맹이를 짚었나", 짚은것.length >= 4, `${짚은것.join("·")} (${짚은것.length}/${알맹이.length})`],
];
console.log();
for (const [이름, ok, 값] of 잼) console.log(`${ok ? "맞음  " : "**어긋남**"} ${이름} — ${값}`);
const 맞음 = 잼.filter((x) => x[1]).length;
console.log(`\n${맞음}/${잼.length}`);
writeFileSync(`${칸}/기준.json`, JSON.stringify(r, null, 2));
console.log(`기준 → ${칸}/기준.json  (이대로 app_build 주문이 된다)`);
if (맞음 < 잼.length) process.exitCode = 1;
