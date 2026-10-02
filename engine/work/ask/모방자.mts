/**
 * **모방 기계가 진짜로 구조를 뽑나** (228회차 10-02).
 *   npx tsx engine/tools/rookery_env.mts engine/work/ask/모방자.mts <사진> [--진짜]
 *   (사진을 안 주면 두근도트 채팅 화면을 찍어서 쓴다)
 *
 * 재는 것은 "말이 그럴듯한가" 가 아니다 — 그건 눈으로 봐야 한다. 여기서 재는 것은
 * **안 지어냈나**다:
 *   ① 뼈대를 3개 이상 갈랐나 (한 덩어리로 뭉개면 베낄 것이 없다)
 *   ② `옮기면` 이 **무엇 → 무엇** 으로 짝지어졌나 (없으면 감상문이다)
 *   ③ `못본것` 을 **채웠나** (비면 다 본 게 아니라 안 본 것이다)
 *   ④ `안가져올것` 을 적었나 (남의 로고·캐릭터를 가져오면 안 된다)
 * ③ 이 제일 중요하다. 사진 한 장으로 움직임까지 아는 척하면 나는 없는 것을 짓게 된다.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { openHeadless } from "../../../src/lib/video/headless";

const 사진길 = process.argv.find((a) => /\.(png|jpe?g)$/i.test(a));
const 진짜 = process.argv.includes("--진짜");
const 칸 = "C:/Users/az518/Desktop/로키-모방자";
mkdirSync(칸, { recursive: true });

let 그림: string;
if (사진길 && existsSync(사진길)) {
  그림 = readFileSync(사진길).toString("base64");
  console.log(`사진: ${사진길}`);
} else {
  // 사진을 안 주면 **우리가 아는 화면**을 찍는다 — 답을 아는 것으로 재야 자가 자다.
  const 창 = await openHeadless({ width: 420, height: 820 });
  if (!창) { console.error("창을 못 띄웠다"); process.exit(1); }
  const page = await 창.browser.newPage();
  await page.setViewport({ width: 420, height: 820 });
  await page.goto("http://localhost:3000/ask?시연=1&결=2", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 3000));
  const buf = Buffer.from(await page.screenshot({ type: "jpeg", quality: 70 }));
  writeFileSync(`${칸}/본것.jpg`, buf);
  그림 = buf.toString("base64");
  await 창.close();
  console.log(`사진을 안 줘서 우리 화면(결 2)을 찍었다 → ${칸}/본것.jpg`);
}

type 구조 = {
  무엇: string; 뼈대: { 자리: string; 무엇: string; 높이비중: string }[];
  한줄생김새: string; 글자층: string; 색쓰임: string; 간격: string; 움직임: string;
  옮기면: string[]; 안가져올것: string[]; 못본것: string[];
};

let 구조: 구조;
if (진짜) {
  const { 모방꼴, 모방지시문, 모방물음 } = await import("../../../src/lib/ask/모방");
  const { defaultProviders } = await import("../../../src/lib/execution/shared");
  const { meterProviders } = await import("../../../src/lib/costs/meter");
  const { createServiceClient } = await import("../../../src/lib/supabase/service");
  const db = createServiceClient();
  const { data: co } = await db.from("companies").select("id").eq("name", "권혁수").maybeSingle();
  const { ai } = meterProviders(defaultProviders(null), db, { companyId: (co as any).id, purpose: "ui_copy" } as any);
  const { output } = await ai.generateStructuredOutput({
    systemInstructions: 모방지시문, input: 모방물음, images: [그림],
    schema: 모방꼴, schemaName: "ui_copy", maxTokens: 16000, tier: "judgment",
  });
  구조 = output as 구조;
} else {
  const r = await fetch("http://localhost:3000/api/ask/copy", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ 그림 }),
  });
  const j = await r.json() as { 구조?: 구조; 잘못?: string };
  if (!j.구조) { console.error(`못 받음: ${j.잘못}`); process.exit(1); }
  구조 = j.구조;
}
console.log(진짜 ? "**진짜 모델**로 쟀다(값이 든다)\n" : "목(mock)으로 쟀다 — 배관만 본다. 판정을 재려면 --진짜\n");

console.log(`무엇: ${구조.무엇}`);
console.log(`뼈대:`); for (const b of 구조.뼈대) console.log(`  · [${b.자리}] ${b.무엇} (${b.높이비중})`);
console.log(`한 줄 생김새: ${구조.한줄생김새}`);
console.log(`글자 층: ${구조.글자층}`);
console.log(`색 쓰임: ${구조.색쓰임}`);
console.log(`간격: ${구조.간격}`);
console.log(`움직임: ${구조.움직임}`);
console.log(`옮기면:`); for (const x of 구조.옮기면) console.log(`  → ${x}`);
console.log(`안 가져올 것:`); for (const x of 구조.안가져올것) console.log(`  ✗ ${x}`);
console.log(`못 본 것:`); for (const x of 구조.못본것) console.log(`  ? ${x}`);

const 잼: [string, boolean, string][] = [
  ["① 뼈대를 3개 이상 갈랐나", 구조.뼈대.length >= 3, `${구조.뼈대.length}개`],
  ["② 옮기면이 짝지어졌나(화살표/→ 들어감)", 구조.옮기면.length >= 3 && 구조.옮기면.some((x) => /→|->|가 된다|로 간다|자리/.test(x)), `${구조.옮기면.length}줄`],
  ["③ 못 본 것을 채웠나", 구조.못본것.length >= 1, `${구조.못본것.length}개`],
  ["④ 안 가져올 것을 적었나", 구조.안가져올것.length >= 1, `${구조.안가져올것.length}개`],
];
console.log();
for (const [이름, ok, 값] of 잼) console.log(`${ok ? "맞음  " : "**어긋남**"} ${이름} — ${값}`);
const 맞음 = 잼.filter((x) => x[1]).length;
console.log(`\n${맞음}/${잼.length}`);
writeFileSync(`${칸}/구조.json`, JSON.stringify(구조, null, 2));
console.log(`구조 → ${칸}/구조.json`);
if (맞음 < 잼.length) process.exitCode = 1;
