/**
 * **3D 게임: 아스트라 대 원래 쓰던 자리** (228회차 10-02, 사장님 "3디 게임 비교 아스트라 대 원래 쓰던거").
 *
 *   npx tsx engine/tools/rookery_env.mts engine/work/3d-compare/판.mts [모델,모델] [판수=1]
 *
 * ## 공평하게 재는 법
 * 같은 주문(`engine/work/webgl/order.txt`) · 같은 프롬프트(`WHOLE_BUILD_SYSTEM`·`wholeBuildInput`) ·
 * 같은 꼴(`buildSchema`) · 같은 토큰 상한. **다른 것은 자리 하나뿐**이다.
 * 그리고 재는 자도 같은 것(`engine/work/webgl/자.mts`)을 쓴다 — 자가 다르면 비교가 아니다.
 *
 * ## 한 방에 만들게 한다(고치는 고리 없이)
 * 고리를 돌리면 "모델이 얼마나 잘 만드나" 가 아니라 "고리가 얼마나 잘 고치나" 를 재게 된다.
 * 09-15 에 아스트라를 쟀을 때도 **실속은 4~5배인데 형식이 덜 미더웠다** — 그 차이는 첫 판에서 갈린다.
 *
 * ## 값
 * 아스트라는 제일 비싼 자리(기본의 12배)다. 돌릴 때마다 **실제로 재서** 찍는다 —
 * 10-01 에 한 번 재고 61배로 곱했다가 10배 틀렸다.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

const { WHOLE_BUILD_SYSTEM, wholeBuildInput, buildSchema } = await import("../../../src/lib/skills/appBuild/index");
const { createOpenAIProvider } = await import("../../../src/lib/providers/openai");
const { createServiceClient } = await import("../../../src/lib/supabase/service");
const { meterProviders } = await import("../../../src/lib/costs/meter");

const 모델들 = (process.argv[2] ?? "gpt-6-astra,gpt-5.6-luna").split(",");
const 판수 = Number(process.argv[3] ?? 1);
const 뿌리 = "engine/work/3d-compare";

const db = createServiceClient();
const { data: co } = await db.from("companies").select("id").eq("name", "권혁수").maybeSingle();
if (!co) { console.error("회사를 못 찾았다"); process.exit(1); }

// 주문에서 기준 18줄을 뽑는다 — 자가 재는 것과 같은 줄이어야 한다.
const 주문 = readFileSync("engine/work/webgl/order.txt", "utf8");
const 기준글 = 주문.split("## 확인 가능한 기준")[1]?.split("## 만들 때")[0] ?? "";
const criteria = 기준글.split(String.fromCharCode(10))
  .map((l) => l.trim()).filter((l) => /^\d+\./.test(l))
  .map((l, i) => ({ id: `C${String(i + 1).padStart(2, "0")}`, when: "게임을 열어서 해 본다", then: l.replace(/^\d+\.\s*/, "") }));
const spec = { title: "WebGL 로 도는 3D 우주 슈팅 게임", criteria, touch: [] as string[] };
console.log(`주문에서 뽑은 기준 ${criteria.length}개 · 자리 ${모델들.join(" vs ")} · ${판수}판씩\n`);

// 기기 줄은 **양쪽 같게** — 마우스 쓰는 데스크톱.
const 기기 = "\n\n## 사장님이 쓰는 기기\n- 데스크톱 · 마우스와 키보드 · 1280x800 · 포인터 락 됨";
const 몸통 = 주문.split("## 확인 가능한 기준")[0];
const 입력 = wholeBuildInput(spec, 기기, null) + "\n\n## 부탁 원문\n" + 몸통;

type 잰것 = { 모델: string; 판: number; 초: number; 값: number; 파일: number; 글자: number; 스스로맞다한것: number; 터짐: string | null };
const 잰것들: 잰것[] = [];

for (const 모델 of 모델들) {
  for (let 판 = 1; 판 <= 판수; 판++) {
    // **덮어쓰지 않는다.** 10-02 에 둘째 판이 첫 판을 지워서 나란히 못 봤다 — 재는 일에서 지우는 것은 손해다.
    let 칸 = path.join(뿌리, `${모델}-${판}`);
    for (let n = 판; existsSync(칸); n++) 칸 = path.join(뿌리, `${모델}-${n + 1}`);
    mkdirSync(칸, { recursive: true });
    // 값은 장부로 잰다 — 도구가 계량기를 안 거치면 그 돈은 없는 돈이 된다(10-01 에 7번 샜다).
    const { ai } = meterProviders({ ai: createOpenAIProvider({ judgmentModel: 모델 }) } as any, db, { companyId: (co as any).id, purpose: `3d_compare_${모델}` } as any);
    const 앞장부 = await 쓴돈(모델);
    const t0 = Date.now();
    try {
      const r = await ai.generateStructuredOutput({
        systemInstructions: WHOLE_BUILD_SYSTEM, input: 입력,
        schema: buildSchema, schemaName: "app_build", maxTokens: 100000, tier: "judgment",
      });
      const 초 = Math.round((Date.now() - t0) / 1000);
      for (const f of r.output.files) {
        const p = path.join(칸, f.path);
        mkdirSync(path.dirname(p), { recursive: true });
        writeFileSync(p, f.contents);
      }
      const 글자 = r.output.files.reduce((s, f) => s + f.contents.length, 0);
      const 값 = (await 쓴돈(모델)) - 앞장부;
      잰것들.push({ 모델, 판, 초, 값, 파일: r.output.files.length, 글자, 스스로맞다한것: r.output.coverage.filter((x) => x.met).length, 터짐: null });
      console.log(`${모델.padEnd(14)} ${판}판 — ${초}초 · $${값.toFixed(3)} · 파일 ${r.output.files.length}개 · ${(글자 / 1024).toFixed(0)}KB · 스스로 "지켰다" ${r.output.coverage.filter((x) => x.met).length}/${criteria.length}`);
    } catch (e) {
      const 값 = (await 쓴돈(모델)) - 앞장부;
      잰것들.push({ 모델, 판, 초: Math.round((Date.now() - t0) / 1000), 값, 파일: 0, 글자: 0, 스스로맞다한것: 0, 터짐: e instanceof Error ? e.message : String(e) });
      console.log(`${모델.padEnd(14)} ${판}판 — **터짐** $${값.toFixed(3)} · ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

async function 쓴돈(모델: string): Promise<number> {
  const { data } = await db.from("model_usage").select("cost_usd").eq("purpose", `3d_compare_${모델}`).limit(500);
  return ((data ?? []) as any[]).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
}

console.log(`\n| 자리 | 판 | 초 | 값 | 파일 | 크기 | 스스로 "지켰다" |`);
console.log(`|---|---|---|---|---|---|---|`);
for (const x of 잰것들) console.log(`| ${x.모델} | ${x.판} | ${x.터짐 ? "—" : x.초} | $${x.값.toFixed(3)} | ${x.파일} | ${(x.글자 / 1024).toFixed(0)}KB | ${x.터짐 ? "터짐" : `${x.스스로맞다한것}/${criteria.length}`} |`);
console.log(`\n합 $${잰것들.reduce((s, x) => s + x.값, 0).toFixed(3)}`);
console.log(`\n**스스로 "지켰다" 는 자기 신고다.** 진짜는 다음 줄로 잰다:`);
for (const x of 잰것들.filter((y) => !y.터짐)) console.log(`  npx tsx engine/work/webgl/자.mts ${뿌리}/${x.모델}-${x.판}`);
