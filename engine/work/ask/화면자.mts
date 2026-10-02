/**
 * **화면 보기가 입을 다무나** (228회차 10-02). 호출 2번(그림 든 판단 자리).
 *   npx tsx engine/tools/rookery_env.mts engine/work/ask/화면자.mts
 *
 * 이 기능에서 제일 쉬운 실패는 "말을 못 하는 것" 이 아니라 **쉴 새 없이 말하는 것**이다.
 * 20초마다 한마디씩 하면 사장님이 켜자마자 끈다. 그래서 자가 재는 것은 두 가지다:
 *   ① 그냥 일하는 화면에서 **입을 다무나**
 *   ② 빨간 오류가 떠 있는 화면에서 **말을 거나**
 * ① 이 더 중요하다 — 틀려도 되는 쪽은 ②(한 번 못 본 것)이고, ① 이 틀리면 기능이 죽는다.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { openHeadless } from "../../../src/lib/video/headless";

const 칸 = "C:/Users/az518/Desktop/로키-화면자";
mkdirSync(칸, { recursive: true });

const 보통화면 = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#1e1e1e;color:#d4d4d4;font:14px/1.6 Consolas,monospace;padding:24px">
<div style="color:#569cd6">export function</div> <span style="color:#dcdcaa">합계</span>(줄: number[]) {<br>
&nbsp;&nbsp;<span style="color:#569cd6">return</span> 줄.<span style="color:#dcdcaa">reduce</span>((a, b) =&gt; a + b, 0);<br>}
<br><br><div style="color:#6a9955">// 그냥 코드를 쓰는 중이다. 아무 일도 안 일어났다.</div>
<div style="color:#6a9955">// 터미널도 조용하고 오류도 없다.</div>
</body>`;

const 오류화면 = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#1e1e1e;color:#d4d4d4;font:14px/1.6 Consolas,monospace;padding:24px">
<div style="background:#5a1d1d;border-left:4px solid #f14c4c;padding:14px;color:#f48771">
<b style="color:#f14c4c">Error: ENOENT: no such file or directory, open 'src/lib/lie/case.ts'</b><br>
&nbsp;&nbsp;at Object.readFileSync (node:fs:471:19)<br>
&nbsp;&nbsp;at loadCase (src/lib/lie/turn.ts:22:14)<br>
&nbsp;&nbsp;at POST (src/app/api/lie/turn/route.ts:40:9)
</div>
<div style="margin-top:12px;color:#808080">$ npm run build<br>$ npm run build<br>$ npm run build<br>$ npm run build</div>
</body>`;

const 창 = await openHeadless({ width: 1280, height: 800 });
if (!창) { console.error("창을 못 띄웠다"); process.exit(1); }
const page = await 창.browser.newPage();

async function 찍기(이름: string, html: string): Promise<string> {
  await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`, { waitUntil: "load" });
  const buf = await page.screenshot({ type: "jpeg", quality: 65 });
  writeFileSync(`${칸}/${이름}.jpg`, Buffer.from(buf));
  return Buffer.from(buf).toString("base64");
}

const 판: { 이름: string; 그림: string; 말걸어야하나: boolean }[] = [
  { 이름: "그냥-코드-쓰는-중", 그림: await 찍기("보통", 보통화면), 말걸어야하나: false },
  { 이름: "빨간-오류-+-같은-명령-네-번", 그림: await 찍기("오류", 오류화면), 말걸어야하나: true },
];
await 창.close();

/**
 * **진짜 모델로 잴 때는 길을 안 거친다.** 개발 서버는 목(mock)으로 떠 있어서 길로 물으면
 * 늘 "입 다묾" 이 온다 — 그건 배관 시험이지 판정 시험이 아니다.
 * `--진짜` 면 **길과 같은 글·같은 꼴**(`src/lib/ask/화면보기.ts`)로 모델을 바로 부른다.
 */
const 진짜 = process.argv.includes("--진짜");
const 부르기 = 진짜
  ? await (async () => {
      const { 화면판정꼴, 화면지시문, 화면물음 } = await import("../../../src/lib/ask/화면보기");
      const { defaultProviders } = await import("../../../src/lib/execution/shared");
      const { meterProviders } = await import("../../../src/lib/costs/meter");
      const { createServiceClient } = await import("../../../src/lib/supabase/service");
      const db = createServiceClient();
      const { data: co } = await db.from("companies").select("id").eq("name", "권혁수").maybeSingle();
      const { ai } = meterProviders(defaultProviders(null), db, { companyId: (co as any).id, purpose: "screen_watch" } as any);
      return async (그림: string) => {
        const { output } = await ai.generateStructuredOutput({
          systemInstructions: 화면지시문, input: 화면물음(), images: [그림],
          schema: 화면판정꼴, schemaName: "screen_watch", maxTokens: 16000, tier: "judgment",
        });
        return output as { 말걸까: boolean; 말: string; 까닭: string };
      };
    })()
  : async (그림: string) => {
      const r = await fetch("http://localhost:3000/api/ask/screen", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ 그림 }),
      });
      return await r.json() as { 말걸까?: boolean; 말?: string; 까닭?: string; 잘못?: string };
    };
console.log(진짜 ? "**진짜 모델**로 잰다(값이 든다)" : "목(mock)으로 잰다 — 배관만 본다. 판정을 재려면 --진짜");
console.log();

let 맞음 = 0;
for (const t of 판) {
  const j = await 부르기(t.그림) as { 말걸까?: boolean; 말?: string; 까닭?: string; 잘못?: string };
  if (j.잘못) { console.log(`못 잼  ${t.이름} — ${j.잘못}`); continue; }
  const ok = j.말걸까 === t.말걸어야하나;
  if (ok) 맞음++;
  console.log(`${ok ? "맞음  " : "**어긋남**"} ${t.이름} → ${j.말걸까 ? "말 검" : "입 다묾"} (바란 것 ${t.말걸어야하나 ? "말 검" : "입 다묾"})`);
  if (j.말) console.log(`        말: ${j.말}`);
  if (j.까닭) console.log(`        까닭: ${j.까닭}`);
}
console.log(`\n${맞음}/${판.length}`);
console.log(`사진: ${칸}`);
if (맞음 < 판.length) process.exitCode = 1;
