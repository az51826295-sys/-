/**
 * **나누기 판단만 본다** (226회차 2026-09-27). 3D 를 사기 전에 아스트라가 무엇으로 나누는지만 본다 —
 * 조각 하나가 30 크레딧이라 나누기가 틀리면 크게 샌다. 판단 한 번 ≈$0.05, 크레딧 0.
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/mesh_split_probe.mts "주문"
 */
import { z } from "zod";
import { defaultProviders } from "../../src/lib/execution/shared";

const asks = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const cases = asks.length ? asks : [
  "은색 판금 갑옷을 입은 중세 기사를 만들어 줘. 닫힌 투구, 실제 사람 비율.",
  "나무 보물상자 하나 만들어 줘.",
  "검 한 자루. 손잡이는 가죽, 날은 강철.",
  "판타지 궁수 캐릭터 — 후드 망토, 가죽 갑옷, 활과 화살통.",
];
const schema = z.object({
  나눈다: z.boolean(), 왜: z.string(),
  조각: z.array(z.object({ 주문: z.string(), 붙는곳: z.string() })),
});
const SYS = [
  "너는 3D 작업을 조각으로 나누는 사람이다. 이 회사 방식은 **맨몸을 먼저 만들고 갑옷·무기를 조각으로 얹는 것**이다",
  "(딱딱한 조각은 뼈에 매다니 리깅을 안 사도 된다 — 조각당 5 크레딧이 굳는다).",
  "- 소품 하나(상자·검 한 자루)나 이미 조각 하나를 말한 주문은 **나누지 않는다**(나눈다=false).",
  "- \"갑옷 입은 기사\" 처럼 몸과 얹는 것이 섞인 주문은 나눈다: 맨몸 · 투구 · 흉갑 · 무기 식으로.",
  "- **맨몸이 있으면 첫 번째에 둔다.**",
  "- 조각 하나에 30 크레딧과 그림값이 든다. 넷을 넘기지 마라. 애매하면 나누지 않는다.",
  "- 매니저가 적은 색·재질·비율을 각 조각 주문에 그대로 옮겨 적어라.",
].join(String.fromCharCode(10));

for (const ask of cases) {
  const { output, model } = await defaultProviders().ai.generateStructuredOutput({
    systemInstructions: SYS, input: `업무: ${ask}`, schema, schemaName: "mesh_split", maxTokens: 16000, tier: "judgment",
  });
  console.log(`\n주문: ${ask}`);
  console.log(`  ${output.나눈다 ? `**${output.조각.length}조각**` : "안 나눔"} · ${output.왜.slice(0, 70)} (${model})`);
  for (const p of output.조각) console.log(`    - [${p.붙는곳 || "몸"}] ${p.주문.slice(0, 70)}`);
  const credits = output.나눈다 ? output.조각.length * 30 : 30;
  console.log(`  크레딧 ${credits} · 그림값 별도`);
}
