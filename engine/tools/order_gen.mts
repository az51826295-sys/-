/**
 * **데이터 수집기 — 주문을 로키가 만든다** (219회차 09-25, 사장님 "데이터 수집을 하게 니가 만들 수도 있는 거 아니야?").
 *
 * 다른 AI 가 "고3 1인 창업자 손님" 역을 맡아 진짜 같은 주문을 쓰고 → **진짜 접수**(intakeInstructions + everyday_plan, 화면과 같은 프롬프트)가
 * 누구에게 맡길지 정하고 → 위임(delegate, 화면과 같은 길: 자동 채용·지식 카드·업무 생성) → 워커가 일한다.
 * 결과는 `order_score` 가 나중에 자·값·시간으로 센다. 값이 싼 종류만(분석·발표·문구·번역·자막·그림). 영상·3D 는 --expensive 를 줘야.
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/order_gen.mts [--n 3] [--dry] [--expensive] [--cap 9.5]
 *   --dry: 주문 만들고 접수까지만(직원 일 안 시킴, 값 ≈ $0.03). --cap: 이번 주 지출이 이 값을 넘으면 안 넣는다.
 */
import { z } from "zod";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { workStateText } = await import("../../src/lib/chat/workState");
const { intakeInstructions } = await import("../../src/lib/chat/routing");
const { defaultProviders } = await import("../../src/lib/execution/shared");
const { seatProvider } = await import("../../src/lib/skills/appBuild/seats");

const { writeFileSync, mkdirSync, existsSync, readFileSync } = await import("node:fs");
const { dispatchOrder } = await import("./order_dispatch.mjs");
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const RESUME = arg("--resume");   // 지난 배치에서 직원이 바빠 못 넣은 주문을 다시 넣는다(생성·접수 안 함, 돈 0)
const N = Number(arg("--n") ?? 3); const DRY = process.argv.includes("--dry"); const EXPENSIVE = process.argv.includes("--expensive"); const CAP = Number(arg("--cap") ?? 9.5);
const NL = String.fromCharCode(10);
const db = createServiceClient();
const CO = "5925c03a-557f-46d7-8589-7388b769df40";   // 사장님 회사

// 0) 지출 문지기 — 사장님 한도($10/7일)보다 안쪽에서 멈춘다.
const since = new Date(Date.now() - 7 * 864e5).toISOString();
const { data: usage } = await db.from("model_usage").select("cost_usd").eq("company_id", CO).gte("created_at", since).limit(5000);   // 회사 한도와 같은 셈(week_spend)
const spent = (usage ?? []).reduce((a: number, r: any) => a + Number(r.cost_usd ?? 0), 0);
console.log(`이번 주 지출 $${spent.toFixed(2)} (멈춤선 $${CAP})`);
if (spent >= CAP && !DRY) { console.log("멈춤선을 넘어 안 넣는다. --dry 로 주문만 만들 수는 있다."); process.exit(0); }

// 1) 손님 AI 가 주문을 쓴다 — 사장님 회사의 사실만 재료로.
const orderSchema = z.object({
  주문: z.array(z.object({
    종류: z.enum(["분석", "발표", "문구", "번역", "자막", "그림", "게임", "영상"]),
    말: z.string().describe("대화창에 실제로 칠 말. 한국어, 학생 말투도 됨. 필요한 사실·문구는 '- ' 줄로 같이 준다(지어낸 숫자 금지). 분석이면 실제 주소를 그대로 쓴다."),
    왜: z.string().describe("이 손님이 왜 이걸 시키나 한 줄."),
  })).min(1).max(12),
});
const facts = [
  "회사: 고3 학생 1인 창업자. 제품 둘 — 로키(대화창에 말하면 게임·영상·문서 같은 진짜 파일이 나오는 서비스) · 별빛 플랫포머(브라우저 2D 점프 게임, 무대 3개, 목숨 3, 터치·키보드).",
  "로키 사실: 대화창에 말하면 mp4·문서 같은 진짜 파일로 나온다 / 이상한 부분만 말하면 그 부분만 다시 만든다 / 가입은 이메일과 비밀번호만, 카드는 안 받는다.",
  "별빛 플랫포머 화면 글자: 플랫포머 게임 · 새벽의 언덕 · 구름 다리 · 별빛 정상 · 클리어! · 게임 오버 · 모든 목숨을 잃었습니다. · 3개의 스테이지를 모두 통과했습니다! · 다시 플레이 · 처음부터 다시 시작 · 터치 조작",
  "분석에 쓸 수 있는 실제 주소: https://www.youtube.com/watch?v=09r1B9cVEQY (레벨 디자인 강연) · https://80.lv/articles/level-design-workshop-blockmesh-and-lighting-tips (글)",
].join(NL);
const kinds = EXPENSIVE ? "분석·발표·문구·번역·자막·그림·게임·영상" : "분석·발표·문구·번역·자막·그림 (게임·영상은 이번엔 빼라 — 값이 비싸다)";
if (RESUME) {
  const prev = JSON.parse(readFileSync(RESUME, "utf8")) as { at: string; rows: { kind: string; ask: string; capabilityId: string | null; assignmentId: string | null; note?: string }[] };
  const { data: co0 } = await db.from("companies").select("owner_id").eq("id", CO).maybeSingle();
  let put = 0;
  for (const r of prev.rows) {
    if (r.assignmentId || !r.capabilityId) continue;
    try { const d = await dispatchOrder(db, CO, r.capabilityId, r.ask, co0!.owner_id as string); r.assignmentId = d.assignmentId; r.note = d.employee; put++; console.log(`  → [${r.kind}] 다시 넣음 · 업무 ${d.assignmentId.slice(0, 8)} · ${d.employee}`); }
    catch (e) { r.note = "아직 못 넣음: " + (e instanceof Error ? e.message.slice(0, 80) : e); console.log(`  → [${r.kind}] ${r.note}`); }
  }
  writeFileSync(RESUME, JSON.stringify(prev, null, 2), "utf8");
  console.log(`다시 넣음 ${put}건 → ${RESUME}`);
  process.exit(0);
}
const customer = await seatProvider("gpt-5.6-luna");
if (!customer) throw new Error("손님 자리를 못 앉혔다");
const { output: gen } = await customer.generateStructuredOutput({
  systemInstructions: [
    "너는 이 회사의 사장(고3 학생, 1인 창업자)이다. AI 회사 로키의 대화창에 **오늘 실제로 시킬 법한 주문**을 쓴다.",
    `종류는 ${kinds} 중에서 골고루. 주문은 짧고 구체적으로, 사실이 필요하면 아래 사실만 '- ' 줄로 붙인다. 없는 숫자·이름·주소를 지어내지 마라.`,
    "학생이 실제로 필요한 것(수행평가 발표·게임 홍보·영어판·자막·로고·강연 정리)으로. 같은 종류를 두 번 시키면 다른 결로.",
    "답은 JSON 하나.",
  ].join(NL),
  input: `## 회사 사실${NL}${facts}${NL}${NL}주문 ${N}개.`,
  schema: orderSchema, schemaName: "customer_orders", maxTokens: 16000, tier: "judgment",
});
const orders = gen.주문.slice(0, N);
console.log(`손님 AI 가 주문 ${orders.length}개를 썼다:`);
for (const [i, o] of orders.entries()) console.log(`  ${i + 1}. [${o.종류}] ${o.말.split(NL)[0].slice(0, 70)}${o.말.includes(NL) ? " …" : ""}`);

// 2) 진짜 접수 → 3) 위임
const intakeSchema = z.object({ reply: z.string().nullable(), searches: z.array(z.string()), drawings: z.array(z.string()), capabilityId: z.string().nullable(), capabilityWhy: z.string().nullable() });
const { data: co } = await db.from("companies").select("id, owner_id").eq("id", CO).maybeSingle();
if (!co) throw new Error("회사 없음");
const ai = defaultProviders().ai;
const batch = { at: new Date().toISOString(), dry: DRY, rows: [] as Record<string, unknown>[] };
for (const o of orders) {
  const w = await workStateText(db, CO, null, o.말);
  let cap: string | null = null, reply = "", why: string | null = null;
  try {
    const r = await ai.generateStructuredOutput({
      systemInstructions: intakeInstructions({ hasImages: false, speaker: { name: "사장님", isOwner: true } }),
      input: (w.hasAny ? `${w.text}${NL}${NL}## 대화${NL}` : "") + `user: ${o.말}`,
      schema: intakeSchema, schemaName: "everyday_plan", maxTokens: 16000, tier: "conversation",
    });
    cap = r.output.capabilityId; reply = r.output.reply ?? ""; why = r.output.capabilityWhy;
  } catch (e) { reply = "접수 실패: " + (e instanceof Error ? e.message : e); }
  let assignmentId: string | null = null, hired: string | null = null, note = "";
  if (cap && !DRY) {
    try {
      const d = await dispatchOrder(db, CO, cap, o.말, co.owner_id as string);
      assignmentId = d.assignmentId; hired = d.hired; note = d.employee;
    } catch (e) { note = "위임 실패: " + (e instanceof Error ? e.message : e); }
  }
  console.log(`  → [${o.종류}] 접수 ${cap ?? "안 맡김"}${assignmentId ? ` · 업무 ${assignmentId.slice(0, 8)}` : DRY ? " (dry)" : ""}${hired ? ` · 새로 뽑음 ${hired}` : ""}${note ? ` · ${note.slice(0, 80)}` : ""}`);
  batch.rows.push({ kind: o.종류, ask: o.말, why: o.왜, capabilityId: cap, reply: reply.slice(0, 200), assignmentId, hired, note });
}
mkdirSync("engine/work/anything/orders", { recursive: true });
const file = `engine/work/anything/orders/${batch.at.replace(/[:.]/g, "-")}.json`;
writeFileSync(file, JSON.stringify(batch, null, 2), "utf8");
console.log(`${NL}저장 ${file}${NL}다음: 워커가 일한 뒤 → npx tsx engine/tools/rookery_env.mts engine/tools/order_score.mts ${file}`);
