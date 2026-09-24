/**
 * 딥시크 공급자의 "모양 고장 한 번 고쳐 받기" 시험 (210회차 09-24). 가짜 클라이언트를 꽂아 실제 돈은 안 쓴다.
 * 재는 것: 고쳐지는가 · 두 호출의 토큰이 합쳐지는가 · 두 번째도 어긋나면 던지는가 · 잘림은 고쳐 받지 않는가.
 */
import { z } from "zod";
const { createDeepSeekProvider } = await import("../../src/lib/providers/deepseek");
process.env.DEEPSEEK_API_KEY ||= "probe";
const schema = z.object({ items: z.array(z.object({ name: z.string(), why: z.string() })) });
type Reply = { content: string | null; finish?: string };
function fake(replies: Reply[]) {
  const calls: unknown[] = [];
  const client = { chat: { completions: { create: async (req: unknown) => {
    calls.push(req);
    const r = replies[calls.length - 1] ?? { content: null };
    return { model: "deepseek-flash", system_fingerprint: "fp", choices: [{ finish_reason: r.finish ?? "stop", message: { content: r.content, refusal: null } }], usage: { prompt_tokens: 100, completion_tokens: 10, prompt_cache_hit_tokens: 5 } };
  } } } };
  return { client, calls };
}
const good = JSON.stringify({ items: [{ name: "a", why: "b" }] });
const bad = JSON.stringify({ items: [{ name: "a", why: null }] });
let pass = 0, total = 0;
async function run(label: string, replies: Reply[], expect: { ok: boolean; calls: number; code?: string }) {
  total++;
  const { client, calls } = fake(replies);
  const ai = createDeepSeekProvider({ client: client as never, judgmentModel: "deepseek-v4-flash" });
  let got: { ok: boolean; code?: string; inputTokens?: number; outputTokens?: number };
  try {
    const r = await ai.generateStructuredOutput({ systemInstructions: "json", input: "x", schema, schemaName: "probe", tier: "judgment" });
    got = { ok: true, inputTokens: r.inputTokens, outputTokens: r.outputTokens };
  } catch (e) { got = { ok: false, code: e instanceof Error ? e.message : String(e) }; }
  const okMatch = got.ok === expect.ok && calls.length === expect.calls && (!expect.code || (got.code ?? "").startsWith(expect.code));
  const tokensOk = !got.ok || (got.inputTokens === 100 * expect.calls && got.outputTokens === 10 * expect.calls);
  const fine = okMatch && tokensOk;
  if (fine) pass++;
  console.log(`${fine ? "맞음" : "틀림"}  ${label}: 호출 ${calls.length}(기대 ${expect.calls}) · ${got.ok ? `됨 · 토큰 ${got.inputTokens}/${got.outputTokens}` : `던짐 ${got.code?.slice(0, 50)}`}`);
  if (calls.length === 2) {
    const msgs = (calls[1] as { messages: { role: string; content: string }[] }).messages;
    const hasAssistant = msgs.some((m) => m.role === "assistant");
    const lastUser = msgs[msgs.length - 1];
    console.log(`       고침 요청: 메시지 ${msgs.length}개 · 앞 답 들어감 ${hasAssistant} · 마지막 줄 "${lastUser.content.slice(0, 40)}…"`);
  }
}
await run("모양 어긋남 → 고쳐 받음", [{ content: bad }, { content: good }], { ok: true, calls: 2 });
await run("못 읽음(깨진 JSON) → 고쳐 받음", [{ content: "{items: [" }, { content: good }], { ok: true, calls: 2 });
await run("빈 답 → 고쳐 받음", [{ content: null }, { content: good }], { ok: true, calls: 2 });
await run("두 번 다 어긋남 → 던짐(한 번만)", [{ content: bad }, { content: bad }], { ok: false, calls: 2, code: "MODEL_OUTPUT_OFF_SCHEMA" });
await run("잘림 → 바로 던짐(고쳐 받지 않음)", [{ content: bad, finish: "length" }], { ok: false, calls: 1, code: "MODEL_OUTPUT_TRUNCATED" });
await run("처음부터 맞음 → 한 번", [{ content: good }], { ok: true, calls: 1 });
console.log(`\n${pass}/${total}`);
