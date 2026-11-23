/**
 * **정찰: 싼 AI 한 번 답이 두근도트 기계 자에 얼마나 떨어지나 — 영어 첫 답** (11-23, 사장님 "ㄱㄱ 2번").
 *   GENESIS_SPEND=i-approve npx tsx engine/tools/dot_scout_en.mts [--mock]
 *
 * 설계·대상 고르는 식: engine/docs/select-by-ruler-design.md "다음 대상 정찰" (돌리기 전 잠금).
 * 운영과 같은 길: prepareTurn(개발자 링크 무제한 → 하트·DB 쓰기 0) → deepseek-v4-flash(json_object, 생각 끔) → tidyReply.
 * 새 손님 id 라 사이 1단계·지난 대화 0 — 처음 온 사람의 첫 답이다.
 * 결과: engine/work/select-by-ruler/scout-en.json (답 전부, 사장님이 읽을 수 있게).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const i = l.indexOf("="); if (i > 0 && /^[A-Z_]+$/.test(l.slice(0, i))) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^"|"$/g, "");
}
const MOCK = process.argv.includes("--mock");
if (!MOCK && process.env.GENESIS_SPEND !== "i-approve") { console.error("GENESIS_SPEND=i-approve 가 없다 — 돈 드는 판은 안 돈다(--mock 은 된다)"); process.exit(1); }

const { createServiceClient } = await import("../../src/lib/supabase/service");
const { prepareTurn, answer } = await import("../../src/lib/dot/turn");
const { tidyReply } = await import("../../src/lib/dot/bubbles");
const { RULES } = await import("./dot_reply_rules.mts");
const { default: OpenAI } = await import("openai");
const { z } = await import("zod");

/** 영어 첫마디 셋 — 고정(잠금). 인사·감정·질문 한 가지씩. */
const 첫마디 = ["hey", "I had a really rough day at school today", "what do you like to do on weekends?"];

/** 이름을 묻나 — 지시문이 첫 답에서 시킨다. 물음표 + name/call 낱말. */
const 이름물음 = (t: string) => /\?/.test(t) && /\b(name|call you|call u)\b/i.test(t);

const db = createServiceClient();
const { data: cs, error } = await db.from("dot_characters").select("id, slug, name").eq("is_public", true).order("created_at", { ascending: true });
if (error) throw new Error(error.message);
const 사람들 = (cs ?? []) as { id: string; slug: string; name: string }[];
console.log(`캐릭터 ${사람들.length}명 × 첫마디 ${첫마디.length} = ${사람들.length * 첫마디.length}답${MOCK ? " (mock — 모델 0)" : ""}`);

const ds = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY ?? "x", baseURL: "https://api.deepseek.com/v1", maxRetries: 1 });
const 상한 = 1.4, 값 = { in: 0.28 / 1e6, out: 0.42 / 1e6 };   // 어림(설계 문서의 deepseek 값). 상한은 문서와 같이 센다.
let 쓴돈 = 0;
type 줄 = { slug: string; 말: string; 답: string | null; 감정?: string; 못잼?: string; 떨어짐: string[] };
const 줄들: 줄[] = [];

for (const c of 사람들) {
  for (const 말 of 첫마디) {
    if (쓴돈 > 상한) { 줄들.push({ slug: c.slug, 말, 답: null, 못잼: "상한", 떨어짐: [] }); continue; }
    const p = await prepareTurn(db, randomUUID(), c.id, 말, { lang: "en", 무제한: true });
    if ("ok" in p) { 줄들.push({ slug: c.slug, 말, 답: null, 못잼: `prepare:${p.reason}`, 떨어짐: [] }); continue; }
    let 답: string, 감정 = "";
    if (MOCK) {
      답 = 말.length % 2 ? "Hey there\n안녕 what should I call you?" : "Oh hi\nWhat should I call you?";   // 한글 섞인 것 하나를 일부러 — 자가 잡는지
    } else {
      try {
        const r = await ds.chat.completions.create({
          model: "deepseek-v4-flash", max_tokens: 1200, response_format: { type: "json_object" },
          // @ts-expect-error DeepSeek 확장 — 운영과 같이 생각을 끈다
          thinking: { type: "disabled" },
          messages: [
            { role: "system", content: p.system + `\n\n---\n답은 **오직 JSON 하나**로 낸다. 키 순서는 emotion, reply, remember. 이 JSON Schema 를 그대로 따른다 (dot_reply):\n` + JSON.stringify(z.toJSONSchema(answer)) },
            { role: "user", content: p.input },
          ],
        });
        쓴돈 += (r.usage?.prompt_tokens ?? 0) * 값.in + (r.usage?.completion_tokens ?? 0) * 값.out;
        const parsed = answer.safeParse(JSON.parse(r.choices[0]?.message?.content ?? "{}"));
        if (!parsed.success) { 줄들.push({ slug: c.slug, 말, 답: null, 못잼: "모양 어긋남", 떨어짐: [] }); continue; }
        답 = parsed.data.reply; 감정 = parsed.data.emotion;
      } catch (e) { 줄들.push({ slug: c.slug, 말, 답: null, 못잼: e instanceof Error ? e.message.slice(0, 80) : "오류", 떨어짐: [] }); continue; }
    }
    답 = tidyReply(답);
    const 떨어짐 = RULES.filter((r) => r.on !== "ko" && r.fail(답)).map((r) => r.id);
    if (!이름물음(답)) 떨어짐.push("첫 답에서 이름을 안 물음");
    줄들.push({ slug: c.slug, 말, 답, 감정, 떨어짐 });
    process.stdout.write(".");
  }
}
console.log("\n");

const 잰것 = 줄들.filter((x) => x.답 !== null);
const 칸들 = [...RULES.filter((r) => r.on !== "ko").map((r) => r.id), "첫 답에서 이름을 안 물음"];
const 표 = 칸들.map((id) => ({ id, n: 잰것.filter((x) => x.떨어짐.includes(id)).length })).map((r) => ({ ...r, 비율: r.n / Math.max(1, 잰것.length) }));
for (const r of 표) console.log(`  ${(r.비율 * 100).toFixed(1).padStart(5)}%  ${r.n}/${잰것.length}  ${r.id}`);
const 하나라도 = 잰것.filter((x) => x.떨어짐.length).length;
console.log(`\n하나라도 떨어진 답 ${하나라도}/${잰것.length} · 못 잼 ${줄들.length - 잰것.length} · 값 ≈ $${쓴돈.toFixed(4)}`);
const 후보 = 표.filter((r) => r.비율 >= 0.2).sort((a, b) => b.비율 - a.비율)[0];
console.log(후보 ? `→ 대상(잠근 식: 20% 이상 중 가장 높은 것): ${후보.id} ${(후보.비율 * 100).toFixed(0)}%` : "→ 20% 넘는 칸 없음 — 이 길도 천장. 고르기 판을 안 연다.");

mkdirSync("engine/work/select-by-ruler", { recursive: true });
writeFileSync(`engine/work/select-by-ruler/scout-en${MOCK ? "-mock" : ""}.json`, JSON.stringify({ at: new Date().toISOString(), 표, 줄들, 쓴돈 }, null, 2));
