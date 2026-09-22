/**
 * **로키가 모자란 자를 말할 줄 아는가** (도구 꽂기 v1 의 5번).
 * 질문 문장은 `engine/docs/genesis/missing-measure-question.txt` **에서 읽는다** —
 * 도구 안에 쓰면 문서와 실제 부른 말이 갈린다(09-22 사장님).
 */
import { z } from "zod";
const { seatProvider } = await import("../../src/lib/skills/appBuild/seats");
const { readFileSync, writeFileSync } = await import("node:fs");
const 질문틀 = readFileSync("engine/docs/genesis/missing-measure-question.txt", "utf8");
const 칸 = [
  ["점프.높이px", "발 딛고 선 땅에서 꼭대기까지 솟은 높이(px)"],
  ["점프.공중프레임", "뛰어서 다시 땅에 닿을 때까지 걸린 프레임 수(전체 길이)"],
  ["점프.상승프레임", "올라가는 데 걸린 프레임 수"],
  ["점프.꼭대기프레임", "꼭대기 근처(1px 안)에 머문 프레임 수"],
  ["점프.하강프레임", "내려오는 데 걸린 프레임 수"],
  ["점프.하강나누기상승", "하강프레임 ÷ 상승프레임. 1보다 작으면 내려올 때가 더 빠르다"],
  ["점프.못오르는발판", "이웃한 발판 쌍 중 뛰어서 못 오르는 개수"],
  ["점프.오르는발판쌍", "올라가는 이웃 발판 쌍의 전체 개수"],
];
const 기준 = { "점프.높이px": 129.8, "점프.공중프레임": 40, "점프.상승프레임": 19, "점프.꼭대기프레임": 4, "점프.하강프레임": 21, "점프.하강나누기상승": 1.11, "점프.못오르는발판": 1, "점프.오르는발판쌍": 6 };
const 경우 = {
  판6: { 원문: `"쫀득해진 것 같은데 클리어가 안돼"\n"너무 높아"`, 값: { "점프.높이px": 123.6, "점프.공중프레임": 39, "점프.상승프레임": 19, "점프.꼭대기프레임": 7, "점프.하강프레임": 20, "점프.하강나누기상승": 1.05, "점프.못오르는발판": 1, "점프.오르는발판쌍": 6 } },
  판4: { 원문: `"너무 빨라"`, 값: { "점프.높이px": 136.5, "점프.공중프레임": 24, "점프.상승프레임": 12, "점프.꼭대기프레임": 3, "점프.하강프레임": 12, "점프.하강나누기상승": 1.0, "점프.못오르는발판": 1, "점프.오르는발판쌍": 6 } },
};
const schema = z.object({
  담을수있나: z.boolean(),
  쓸칸: z.array(z.object({ measure: z.string(), 어떻게: z.string() })),
  모자란자: z.array(z.object({ 이름: z.string(), 뜻: z.string(), 왜필요한가: z.string() })),
  사장님께: z.string(),
});
const ai = await seatProvider("gpt-5.6-luna");
if (!ai) { console.error("자리를 못 앉혔다"); process.exit(1); }
const 표 = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `- ${k} = ${v}`).join("\n");
const 결과: unknown[] = [];
for (const [이름, c] of Object.entries(경우)) {
  for (let n = 1; n <= 3; n++) {
    const input = 질문틀
      .replace("{원문}", c.원문)
      .replace("{칸목록}", 칸.map(([a, b]) => `- ${a} — ${b}`).join("\n"))
      .replace("{지금값}", 표(c.값))
      .replace("{기준값}", 표(기준));
    const { output } = await ai.generateStructuredOutput({
      systemInstructions: "너는 게임을 고치는 AI 를 감독하는 AI 다. 사람이 한 말을 무엇을 재야 하는지로 옮긴다. 본 것만 말하고, 모르면 모른다고 한다.",
      input, schema, schemaName: "missing_measure", maxTokens: 3000, tier: "judgment",
    });
    결과.push({ 경우: 이름, 회차: n, ...output });
    console.log(`\n── ${이름} ${n}/3 ── 담을 수 있나: ${output.담을수있나 ? "예" : "**아니오**"}`);
    if (output.쓸칸.length) console.log(`  쓸 칸: ${output.쓸칸.map((x) => x.measure).join(", ")}`);
    for (const m of output.모자란자) console.log(`  **모자란 자: ${m.이름}** — ${m.뜻}`);
    console.log(`  사장님께: ${output.사장님께.slice(0, 160)}`);
  }
}
writeFileSync("engine/work/missing-measure-result.json", JSON.stringify(결과, null, 2), "utf8");
