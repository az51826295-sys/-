/**
 * **베낀 기준으로 실제로 만들어 본다** (228회차 10-02, 사장님 "영상 하나랑 게임 하나로 가자").
 *   npx tsx engine/tools/rookery_env.mts engine/work/ask/모방으로짓기.mts [모델=gpt-5.6-luna]
 *
 * ## 이것이 사장님 말을 재는 판이다
 * 사장님: *"모방이 생성하는데 절대적으로 빠른건 인정?"* — 인정했다. 이제 **재 본다.**
 *
 * 같은 자리(luna)로 같은 게임을 두 번 짓는다. 다른 것은 **주문 하나뿐**이다:
 *   · 10-02 오전: **손으로 쓴 주문**(engine/work/webgl/order.txt, 기준 18개) → 자 2/5 · 못 돌았다
 *   · 지금:       **베낀 기준**(engine/work/ask/게임모방자.mts 가 장면에서 뽑은 14개)
 *
 * 베낀 기준이 나은 까닭이 있다면 이것이다: 손으로 쓴 주문은 **내가 바란 것**이고,
 * 베낀 기준은 **실제로 돌아간 것에서 뽑은 것**이다. 돌아가는 것을 보고 적으면 못 돌 것을 안 적는다.
 *
 * 그래도 **한 판은 한 판이다.** 이걸로 "모방이 낫다" 를 정하지 않는다 — 한 번 재면 흔들림이 안 보인다.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

const { WHOLE_BUILD_SYSTEM, wholeBuildInput, buildSchema } = await import("../../../src/lib/skills/appBuild/index");
const { createOpenAIProvider } = await import("../../../src/lib/providers/openai");
const { meterProviders } = await import("../../../src/lib/costs/meter");
const { createServiceClient } = await import("../../../src/lib/supabase/service");

const 모델 = process.argv[2] ?? "gpt-5.6-luna";
const 기준길 = "C:/Users/az518/Desktop/로키-게임모방/기준.json";
if (!existsSync(기준길)) { console.error(`베낀 기준이 없다 — 먼저 게임모방자.mts 를 돌려라: ${기준길}`); process.exit(1); }

type 베낀것 = {
  무엇: string; 화면칸: string[]; 조작: string; 규칙: string[]; 손맛: string; 그림결: string;
  기준: { id: string; when: string; then: string }[]; 안가져올것: string[]; 못본것: string[];
};
const 베낀것 = JSON.parse(readFileSync(기준길, "utf8")) as 베낀것;
console.log(`베낀 기준 ${베낀것.기준.length}개 · ${베낀것.무엇}`);

const db = createServiceClient();
const { data: co } = await db.from("companies").select("id").eq("name", "권혁수").maybeSingle();
if (!co) { console.error("회사를 못 찾았다"); process.exit(1); }

/**
 * **두 군데서 베낄 때** (228회차 10-03, 사장님 *"전투는 오늘도 환생, 전체적인건 보내준 사진"*).
 * 사장님이 가리킨 곳이 하나가 아닐 수 있다 — 전체 구조는 이 게임, 전투는 저 게임.
 * 그때 `전투.json`(또는 다른 조각)을 따로 두고 여기서 **합친다.**
 * 손으로 기준.json 을 고치지 않는 까닭: 어느 기준이 **어디서 왔는지**가 지워지면,
 * 나중에 결과가 이상할 때 **사진 탓인지 내 탓인지**를 못 가른다.
 */
type 조각 = { 어디서: string; 어떻게알았나: string; 기준: { id: string; when: string; then: string }[]; 못본것?: string[] };
const 조각길 = "C:/Users/az518/Desktop/로키-게임모방/전투.json";
const 조각 = existsSync(조각길) ? (JSON.parse(readFileSync(조각길, "utf8")) as 조각) : null;
if (조각) console.log(`덧댄 조각: ${조각.어디서} — 기준 ${조각.기준.length}개 (${조각.어떻게알았나})`);

const 모든기준 = [...베낀것.기준, ...(조각?.기준 ?? [])];
const 모든못본것 = [...베낀것.못본것, ...(조각?.못본것 ?? [])];
const spec = { title: 베낀것.무엇, criteria: 모든기준, touch: [] as string[] };
/**
 * **못 본 것은 주문에 안 싣는다.** 장면으로 못 본 것(점수 계산식·적 AI)을 "알아서 해라" 로 넘기면
 * 모델이 지어내고, 그러면 베낀 것이 아니라 또 지어낸 것이 된다. 대신 **모른다고 적어** 둔다 —
 * 그래야 받는 쪽이 "여기는 내가 정해야 하는 자리" 로 읽는다.
 */
const 덧붙임 = [
  "",
  "## 어디서 베꼈나",
  `보고 적은 것이다: ${베낀것.무엇}`,
  ...(조각 ? [
    `**전투만은 다른 곳에서 왔다**: ${조각.어디서} — ${조각.어떻게알았나}`,
    `그래서 ${조각.기준.map((c) => c.id).join("·")} 는 **화면으로 본 것이 아니다.** 수수하게 만들고, 숫자는 네가 정했다고 적어라.`,
  ] : []),
  `화면 칸: ${베낀것.화면칸.join(" · ")}`,
  `조작: ${베낀것.조작}`,
  `손맛: ${베낀것.손맛}`,
  `그림결: ${베낀것.그림결}`,
  "",
  "## 가져오지 않는 것",
  ...베낀것.안가져올것.map((x) => `- ${x}`),
  "",
  "## 장면으로는 못 본 것 — **지어내지 말고 수수하게 정하고, 무엇으로 정했는지 적어라**",
  ...모든못본것.map((x) => `- ${x}`),
  "",
  "## 기기",
  "- 데스크톱 · 마우스와 키보드 · 1280x800 · 포인터 락 됨",
  "",
  /**
   * **영상에서 못 베끼는 것** (228회차 10-03). 모방은 **보이는 것만** 베낀다 —
   * 무엇으로 그렸는지, 바깥 라이브러리를 쓰는지는 화면에 안 보인다.
   * 10-02 에 베낀 기준으로 지었더니 **2D 캔버스**로 그렸고(화면만 보면 똑같다),
   * 10-03 에는 **three.js 를 CDN 에서 받아오려다** 터졌다(THREE is not defined).
   * 그래서 **늘 참인 집 규칙**을 따로 붙인다. 이건 베끼는 게 아니라 우리 쪽 사정이다.
   */
  "## 집 규칙 — 영상에 안 보이지만 늘 지킨다",
  "- **바깥에서 아무것도 받아오지 마라.** CDN·라이브러리·글꼴·그림 주소 금지. three.js 도 안 된다.",
  "  (돌려 보는 자리가 바깥 요청을 막는다 — 받아오면 그 자리에서 죽는다.)",
  /**
   * 3D 줄은 **3D 일 때만** 붙인다. 10-03 에 이 줄이 늘 붙어 있었는데,
   * 베낀 것이 **메뉴와 목록뿐인 2D** 여도 "webgl 로 직접 그려라" 가 따라갔다.
   * 안 쓰는 규칙은 공짜가 아니다 — 09-15 에 기준 189개를 들이밀어 지킴이 2% 로 떨어졌었다.
   */
  ...(/3d|삼디|쓰리디|webgl|입체/i.test(`${베낀것.무엇} ${베낀것.그림결} ${베낀것.화면칸.join(" ")}`)
    ? ["- 3D 면 `canvas.getContext('webgl2')` 또는 `'webgl'` 로 **직접** 그린다. 셰이더와 행렬도 직접 쓴다."]
    : []),
  "- 폴더 하나에 넣고 `index.html` 을 열면 바로 돌아야 한다.",
].join(String.fromCharCode(10));

const 칸 = `engine/work/ask/모방게임-${모델}`;
mkdirSync(칸, { recursive: true });
const { ai } = meterProviders({ ai: createOpenAIProvider({ judgmentModel: 모델 }) } as any, db, { companyId: (co as any).id, purpose: "copy_build" } as any);

const t0 = Date.now();
const { output } = await ai.generateStructuredOutput({
  systemInstructions: WHOLE_BUILD_SYSTEM,
  input: wholeBuildInput(spec, 덧붙임, null),
  schema: buildSchema, schemaName: "app_build", maxTokens: 100000, tier: "judgment",
});
const 초 = Math.round((Date.now() - t0) / 1000);
for (const f of output.files) {
  const p = path.join(칸, f.path);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, f.contents);
}
const 글자 = output.files.reduce((s, f) => s + f.contents.length, 0);
console.log(`\n${모델} — ${초}초 · 파일 ${output.files.length}개 · ${(글자 / 1024).toFixed(0)}KB · 스스로 "지켰다" ${output.coverage.filter((x) => x.met).length}/${모든기준.length}`);

/**
 * **값은 `schemaName` 으로 적힌다.** 내가 scope 에 적은 `purpose` 는 원장이 안 본다(meter.ts 100줄).
 * 그래서 10-03 에 이 줄이 내내 `$0.000` 을 찍었고, 나는 하마터면 "장부에 구멍" 이라고 보고할 뻔했다 —
 * **0 은 "안 썼다" 가 아니라 "그 이름으로는 못 본다" 였다.** 이 판이 쓴 것만 보려고 시각으로 자른다.
 */
const { data: 값 } = await db.from("model_usage").select("cost_usd").eq("purpose", "app_build").gte("created_at", new Date(t0).toISOString());
console.log(`이 판이 쓴 값 $${((값 ?? []) as any[]).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0).toFixed(3)}`);
console.log(`\n이제 **같은 자**로 잰다:`);
console.log(`  npx tsx engine/work/webgl/자.mts ${칸}`);
