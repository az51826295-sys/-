/**
 * **처음 만드는 판을 어느 자리에 앉힐까** (174회차 09-18). 판당 gpt-5 ≈ $0.2 · luna ≈ $0.03 · terra ≈ $0.25.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/build_seat_probe.mts <출력 폴더> [모델,모델,…]
 *
 * 같은 계획(데모 회사의 진짜 벽돌깨기 계획: 기준 그대로)에 아이패드 기기 줄을 붙여, 만드는 프롬프트 **그대로**(`WHOLE_BUILD_SYSTEM`·`wholeBuildInput`)
 * 여러 모델에 시킨다. 재는 것: 시간 · 값(토큰) · 파일 줄 수 · **브라우저에서 실제로 도는가**(콘솔 오류·캔버스·터치 손잡이)는 이 도구 밖에서 본다 —
 * 여기서는 파일을 <출력 폴더>/<모델>.html 로 남긴다.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
const { WHOLE_BUILD_SYSTEM, wholeBuildInput, buildSchema } = await import("../../src/lib/skills/appBuild/index");
const { createOpenAIProvider } = await import("../../src/lib/providers/openai");
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { deviceLine } = await import("../../src/lib/hand/device");

const out = process.argv[2];
const models = (process.argv[3] ?? "gpt-5,gpt-5.6-luna,gpt-5.6-terra").split(",");
mkdirSync(out, { recursive: true });

const db = createServiceClient();
const { data: del } = await db.from("deliverables").select("title, content_json").eq("company_id", "00add05a-e81d-4e04-9980-34bb412a8780").eq("deliverable_type", "app_build").order("created_at", { ascending: false }).limit(1).single();
const c = del!.content_json as { criteria: { id: string; when: string; then: string }[]; target?: string };
const spec = { title: "터치로 하는 벽돌깨기 (HTML 한 파일)", criteria: c.criteria, touch: [] };
const ipad = deviceLine({ ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15", platform: "MacIntel", touchPoints: 5, screen: { w: 1180, h: 820, dpr: 2 }, viewport: { w: 1180, h: 660 }, cores: 8, memoryGB: null, gpu: "Apple GPU", pointerLock: false, standalone: false, lang: "ko-KR" });
const deviceNote = "\n\n## 사장님이 로키를 쓰는 기기(최근, 브라우저가 알려 준 것)\n- " + ipad + "\n웹(HTML) 판이면 **첫 줄의 기기에서 그대로 돌아야 한다**: 터치 기기면 방향키·마우스 대신 터치 조작(가상 패드·드래그·탭)을 기본으로, 포인터 락이 안 되면 마우스 시점 회전을 쓰지 않는다.";
console.log(`계획: "${del!.title}" 의 기준 ${spec.criteria.length}개 · 기기 줄: ${ipad.slice(0, 60)}…\n`);

for (const model of models) {
  const ai = createOpenAIProvider({ judgmentModel: model });
  const t0 = Date.now();
  try {
    const r = await ai.generateStructuredOutput({ systemInstructions: WHOLE_BUILD_SYSTEM, input: wholeBuildInput(spec, deviceNote, null), schema: buildSchema, schemaName: "app_build", maxTokens: 100000, tier: "judgment" });
    const sec = Math.round((Date.now() - t0) / 1000);
    const files = r.output.files;
    const html = files.find((f) => /\.html?$/i.test(f.path)) ?? files[0];
    const p = path.join(out, `${model}.html`);
    writeFileSync(p, html.contents);
    const src = html.contents;
    const touch = /touchstart|pointerdown|ontouch/i.test(src), keys = /keydown|ArrowLeft|ArrowRight/.test(src), canvas = /<canvas/i.test(src);
    const met = r.output.coverage.filter((x) => x.met).length;
    console.log(`${model}: ${sec}초 · 토큰 ${r.inputTokens}→${r.outputTokens} · 파일 ${files.length}개 · ${src.split("\n").length}줄 · 터치 손잡이 ${touch ? "있음" : "없음"} · 방향키 ${keys ? "있음" : "없음"} · 캔버스 ${canvas ? "있음" : "없음"} · 자기 보고 ${met}/${spec.criteria.length}`);
  } catch (e) {
    console.log(`${model}: 실패 — ${e instanceof Error ? e.message : String(e)} (${Math.round((Date.now() - t0) / 1000)}초)`);
  }
}
