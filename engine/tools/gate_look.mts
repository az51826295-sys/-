/**
 * **자리를 고르는 눈이 얼마나 정확한가** (226회차 2026-09-27).
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/gate_look.mts [개수]
 *
 * 오늘 값을 한 것은 하나뿐이다 — `깊게` 게이트(+46점). 지시문은 0점, 엮음은 값만 더 들었고,
 * 싼 자리 교체와 상한 올리기는 근거가 없어 접었다. 그러니 **이 게이트의 정확도가 지금
 * 시스템에서 제일 중요한 숫자**인데, 나는 그것을 내가 지어낸 6건으로만 쟀다.
 *
 * 틀리는 두 방향의 값이 다르다:
 *   · **안 켜야 할 때 켜면** — 대화마다 판단 자리 호출이 붙는다(값이 샌다)
 *   · **켜야 할 때 안 켜면** — 학생이 싼 자리의 답을 받는다. 수능형 시험지에서 그건 62/100 이었고,
 *     같은 문제를 다섯 번 물으면 1/5 이었다. **학생은 틀린 답을 알아볼 수 없다** — 이쪽이 더 나쁘다.
 *
 * 재료는 **사장님이 실제로 친 말**이다. 내가 예시를 지으면 내 편향이 섞인다
 * ([[rookery-speaks-korean-student]] — 09-16 에 내가 알아듣는 말과 로키가 알아듣는 말이 달랐다).
 *
 * **못 하는 것을 적어 둔다**: 여기서는 한 줄만 주고 대화 맥락을 안 준다. 실제 /ask 는 앞 대화를
 * 같이 보므로, 맥락이 있어야 갈리는 줄은 이 자가 실제보다 나쁘게 잰다.
 */
import { createServiceClient } from "../../src/lib/supabase/service";

const 개수 = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 40);
const db = createServiceClient();
const { intakeInstructions } = await import("../../src/lib/chat/routing");
const { firstPass } = await import("../../src/lib/chat/everydayService");
const { defaultProviders } = await import("../../src/lib/execution/shared");
const ai = defaultProviders().ai;

const { data } = await db
  .from("conversation_messages")
  .select("content,created_at")
  .eq("role", "user")
  .order("created_at", { ascending: false })
  .limit(400);

// 같은 말·너무 짧은 말·붙여넣은 덩어리는 뺀다. 게이트가 갈릴 만한 **사람이 친 한 줄**만 본다.
const 본것 = new Set<string>();
const 말들: string[] = [];
for (const m of (data ?? []) as { content: string }[]) {
  const t = (m.content ?? "").trim();
  if (t.length < 3 || t.length > 200) continue;
  if (본것.has(t)) continue;
  본것.add(t);
  말들.push(t);
  if (말들.length >= 개수) break;
}

const SYS = intakeInstructions({
  hasImages: false,
  speaker: { name: process.env.OWNER_NAME ?? "사장님", isOwner: true },
});

const 켜짐: string[] = [];
const 꺼짐: string[] = [];
let 떨어짐 = 0;
for (const t of 말들) {
  try {
    const { output } = await ai.generateStructuredOutput({
      systemInstructions: SYS,
      input: `user: ${t}`,
      schema: firstPass,
      schemaName: "everyday_plan",
      maxTokens: 16000,
      tier: "conversation",
    });
    (output.깊게 ? 켜짐 : 꺼짐).push(t);
  } catch {
    떨어짐++;
  }
}

const 전부 = 켜짐.length + 꺼짐.length;
console.log(`사장님이 실제로 친 말 ${전부}줄${떨어짐 ? ` (못 받은 것 ${떨어짐})` : ""}`);
console.log(`  깊게 켜짐 ${켜짐.length}줄 (${((켜짐.length * 100) / 전부).toFixed(0)}%) · 꺼짐 ${꺼짐.length}줄\n`);

console.log("**켜진 것** — 풀어야 아는 말이 맞나. 아니면 대화마다 값이 새는 것이다:");
for (const t of 켜짐) console.log(`   · ${t.replace(/\s+/g, " ").slice(0, 90)}`);

console.log("\n**꺼진 것 중 숫자·계산이 든 말** — 켜야 했던 것이 섞였는지 눈으로 본다:");
const 의심 = 꺼짐.filter((t) => /\d|계산|몇|확률|개수|넓이|속도|배|구하|풀어|증명|얼마/.test(t));
for (const t of 의심.slice(0, 25)) console.log(`   · ${t.replace(/\s+/g, " ").slice(0, 90)}`);
console.log(`   (숫자·계산이 든 꺼진 말 ${의심.length}줄 / 꺼진 것 ${꺼짐.length}줄)`);

console.log(
  "\n이 자는 **맞다/틀리다를 스스로 못 정한다** — 정답표가 없다. 위 목록을 사람이 보고" +
    " 잘못 켜진 줄·잘못 꺼진 줄을 짚으면, 그때 그 줄들이 정답표가 된다.",
);
