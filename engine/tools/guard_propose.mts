/**
 * **로키가 자를 제안한다** (판 7, 09-22 사장님과 정함).
 *
 * 지금까지는 사장님 말을 **내가** 숫자로 옮겼다. 여섯 판 중 셋이 그 번역에서 샜다.
 * 그래서 이 판부터 **말을 숫자로 옮기는 일을 로키가 한다.**
 *
 * 로키가 보는 것은 **이번 요청 원문**과 **잴 수 있는 칸 목록 + 지금 값**뿐이다.
 * **시험지는 안 보여 준다** — 보면 시험지에 맞춘 자가 나온다(사장님 09-22).
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/guard_propose.mts --out <파일> [--note <앞 제안이 왜 걸렸는지>]
 *
 * **한계**: 제안을 도구가 부른다(엔진 안이 아니다). 그래서 회사 범위가 없어 **원장에 안 적힌다.**
 * 값은 판당 1센트 남짓이지만, 적히지 않는다는 것을 여기 적어 둔다.
 */
import { z } from "zod";
const { seatProvider } = await import("../../src/lib/skills/appBuild/seats");
const { writeFileSync } = await import("node:fs");
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };

const 요청원문 = "점프를 더 쫀득하게";
const 칸 = [
  ["점프.높이px", "발 딛고 선 땅에서 꼭대기까지 솟은 높이(px)"],
  ["점프.공중프레임", "뛰어서 다시 땅에 닿을 때까지 걸린 프레임 수(전체 길이)"],
  ["점프.상승프레임", "올라가는 데 걸린 프레임 수"],
  ["점프.꼭대기프레임", "꼭대기 근처(1px 안)에 머문 프레임 수"],
  ["점프.하강프레임", "내려오는 데 걸린 프레임 수"],
  ["점프.하강나누기상승", "하강프레임 ÷ 상승프레임. 1보다 작으면 내려올 때가 더 빠르다"],
  ["점프.못오르는발판", "이웃한 발판 쌍 중 뛰어서 못 오르는 개수"],
  ["점프.오르는발판쌍", "올라가는 이웃 발판 쌍의 전체 개수"],
  ["점프.착지여유최소px", "내려앉고 나서 발판 오른쪽 끝까지 남는 거리 중 제일 빠듯한 값(px). 작으면 지나쳐 떨어진다"],
];
const 지금값 = {
  "점프.높이px": 129.8, "점프.공중프레임": 40, "점프.상승프레임": 19, "점프.꼭대기프레임": 4,
  "점프.하강프레임": 21, "점프.하강나누기상승": 1.11, "점프.못오르는발판": 1, "점프.오르는발판쌍": 6,
  "점프.착지여유최소px": 11.6,
};

const schema = z.object({
  난간: z.array(z.object({ measure: z.string(), min: z.number().nullable(), max: z.number().nullable(), why: z.string() })),
  안내값: z.array(z.object({ measure: z.string(), min: z.number().nullable(), max: z.number().nullable(), why: z.string() })),
  사장님께: z.string(),
});

const ai = await seatProvider("gpt-5.6-luna");
if (!ai) { console.error("자리를 못 앉혔다"); process.exit(1); }
const note = arg("--note");
const { output } = await ai.generateStructuredOutput({
  systemInstructions: [
    "너는 게임을 고치는 AI 를 감독하는 AI 다. 사람이 한 말을 **무엇을 얼마로 재야 하는지**로 옮기는 일을 한다.",
    "옮긴 숫자가 그 말을 못 담으면, 고치는 AI 는 숫자를 다 맞추고도 사람에게 '아니다' 소리를 듣는다.",
    "",
    "두 가지를 낸다.",
    "- **난간**: 이 고침으로 **망가지면 안 되는 것**. 어기면 고장이다. 게임을 못 깨게 되거나 너무 쉬워지는 것이 여기다.",
    "- **안내값**: 그 말이 이루어졌다고 할 수 있으려면 **어디로 가야 하는가**. 향해 갈 값이다.",
    "",
    "규칙:",
    "- 칸은 아래 목록에 있는 것만 쓴다. 없는 칸이 필요하면 `사장님께` 에 무엇이 더 필요한지 적는다.",
    "- 한 값으로 여러 뜻을 대신하지 마라. 말이 여러 부분을 가리키면 칸도 여러 개여야 한다.",
    "- 지금 값을 그대로 통과시키는 안내값은 쓸모가 없다. 지금 값이 이미 목표 안에 들어 있으면 안 된다.",
    "- 너무 좁게 잡으면 고칠 길이 막힌다. 그 말을 담는 가장 넓은 범위를 써라.",
    "- `사장님께` 에는 **이 제안이 그 말의 무슨 뜻을 담았는지**를 사람 말로 적는다.",
    "  사장님이 읽고 '내가 한 말이 그 뜻이 맞다' 고 할 수 있어야 한다. 숫자 나열이 아니라 뜻을 적는다.",
  ].join("\n"),
  input: [
    `사람이 한 말(원문 그대로): "${요청원문}"`,
    "",
    "잴 수 있는 칸:",
    ...칸.map(([n, d]) => `- ${n} — ${d}`),
    "",
    "지금 이 게임을 재면 이렇다:",
    ...Object.entries(지금값).map(([k, v]) => `- ${k} = ${v}`),
    ...(note ? ["", "앞서 낸 제안이 이래서 걸렸다(무엇이 걸렸는지만 알려 준다 — 어떤 판인지는 안 알려 준다):", note] : []),
  ].join("\n"),
  schema, schemaName: "guard_proposal", maxTokens: 4000, tier: "judgment",
});
const out = arg("--out") ?? "engine/work/stage4-run7/proposal.json";
writeFileSync(out, JSON.stringify(output, null, 2), "utf8");
console.log(`제안 저장: ${out}\n`);
console.log("난간:"); for (const g of output.난간) console.log(`  ${g.measure} ${g.min ?? "-"} ~ ${g.max ?? "-"} · ${g.why}`);
console.log("안내값:"); for (const g of output.안내값) console.log(`  ${g.measure} ${g.min ?? "-"} ~ ${g.max ?? "-"} · ${g.why}`);
console.log(`\n사장님께:\n${output.사장님께}`);
