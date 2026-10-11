/**
 * **접수 자의 정답표를 만든다** (10-12). 모델 0 · 값 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/gate_정답표.mts [40]
 *
 * `gate_look` 은 "깊게 켜짐 0/40" 까지만 말하고 **맞는지 틀리는지는 못 정한다** — 정답표가 없다.
 * 0/40 이 "헛켜짐이 하나도 없다"(좋음)인지 "한 번도 안 켜진다"(나쁨)인지 가를 수가 없다.
 *
 * 정답은 **사람만 안다.** 그때 사장님이 풀이를 원했는지 아닌지는 장부에 없다.
 * 그래서 이 자는 **판정하지 않고 서식만 만든다** — 사장님이 O/X 를 채우면 그게 정답표가 되고,
 * 그때부터 `gate_look` 이 맞춤/틀림을 셀 수 있다.
 *
 * 줄 고르는 법은 `gate_look` 과 **똑같아야 한다** — 다르면 정답표가 다른 줄에 붙는다.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createServiceClient } from "../../src/lib/supabase/service";

const 개수 = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 40);
const 길 = "engine/data/gate-answers.json";
const db = createServiceClient();

const { data } = await db.from("conversation_messages")
  .select("content,created_at").eq("role", "user")
  .order("created_at", { ascending: false }).limit(400);

// gate_look 과 같은 체 — 같은 말·너무 짧은 말·붙여넣은 덩어리는 뺀다
const 본것 = new Set<string>();
const 말들: { 말: string; 때: string }[] = [];
for (const m of (data ?? []) as { content: string; created_at: string }[]) {
  const t = (m.content ?? "").trim();
  if (t.length < 3 || t.length > 200) continue;
  if (본것.has(t)) continue;
  본것.add(t);
  말들.push({ 말: t, 때: m.created_at });
  if (말들.length >= 개수) break;
}

type 칸 = { 말: string; 때: string; 정답: "깊게" | "그냥" | null; 왜: string };
const 옛: 칸[] = existsSync(길) ? JSON.parse(readFileSync(길, "utf8")).줄 ?? [] : [];
const 옛답 = new Map(옛.map((r) => [r.말, r]));

/* **이미 채운 답은 건드리지 않는다.** 새 말이 들어와도 옛 답은 그대로 간다 —
   정답표를 다시 만들 때마다 사람이 다시 채워야 하면 아무도 안 채운다. */
const 줄: 칸[] = 말들.map((m) => 옛답.get(m.말) ?? { 말: m.말, 때: m.때, 정답: null, 왜: "" });
const 채움 = 줄.filter((r) => r.정답).length;

mkdirSync("engine/data", { recursive: true });
writeFileSync(길, JSON.stringify({
  설명: "접수 자(gate_look) 의 정답표. 정답 칸에 '깊게'(판단 자리로 올렸어야 했다) 또는 '그냥'(안 올리는 게 맞다) 을 적는다. null 은 아직 안 정한 것.",
  규칙: "안 켜야 할 때 켜면 대화마다 값이 샌다. 켜야 할 때 안 켜면 학생이 틀린 답을 받는다 — 뒤쪽이 더 나쁘다.",
  줄,
}, null, 2));

console.log(`정답표 서식: ${길}`);
console.log(`  줄 ${줄.length}개 · 이미 채운 것 ${채움}개 · 비어 있는 것 ${줄.length - 채움}개\n`);

/* **숫자·계산이 든 꺼진 말부터 보여 준다** — 거기에 "켰어야 했던 것" 이 섞여 있을 가능성이 높다 */
const 의심 = 줄.filter((r) => !r.정답 && /\d|계산|몇|확률|개수|넓이|속도|배|구하|풀어|증명|얼마/.test(r.말));
console.log(`숫자·계산이 든 줄 ${의심.length}개 — 이것부터 짚으면 된다:\n`);
의심.slice(0, 20).forEach((r, i) => {
  console.log(`${String(i + 1).padStart(3)}. ${r.말.replace(/\s+/g, " ").slice(0, 100)}`);
});
console.log(`\n채우는 법: ${길} 의 \`정답\` 칸에 "깊게" 또는 "그냥" 을 적는다.`);
console.log(`번호로 불러 주셔도 된다 — 내가 채운다. 채워지면 gate_look 이 맞춤/틀림을 센다.`);
