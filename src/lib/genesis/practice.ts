import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { intakeInstructions, capabilityCatalogue } from "@/lib/chat/routing";
import { workStateText } from "@/lib/chat/workState";
import { employeeDefinitions } from "@/lib/employees/definitions";
import { ensureKnowledgeProfile } from "@/lib/chat/delegate";
import { releaseEmployee } from "@/lib/assignments/service";
import { defaultProviders } from "@/lib/execution/shared";
import { meterProviders } from "@/lib/costs/meter";
import { checkAllowance } from "@/lib/costs/allowance";
import { seatProviderForCompany } from "@/lib/skills/appBuild/seats";
import { pushToUser } from "@/lib/push/send";

/**
 * **연습 고리 — 서버 안에서 저절로** (224회차 09-25, 사장님 "자동으로 만들고 싶은데 자동 몰라?").
 *
 * 219회차의 데이터 수집(order_gen → order_score)은 노트북 작업 스케줄러에 걸려 있어서 노트북이 꺼지면 안 돌았다.
 * 같은 일을 **개발 워커**(ROOKERY_SCOPE=dev) 안으로 옮긴다: 하루 한 번(한국 09시 뒤 첫 시간 눈금) 손님 AI 가 주문 N개를 쓰고 →
 * 진짜 접수가 누구에게 맡길지 정하고 → 업무를 만들면 워커가 평소처럼 일하고 자로 잰다. 정오 뒤 첫 눈금에 그날 것을 세어
 * 사장님 폰으로 "아침 정리" 한 줄. 하루 한 번 자물쇠: 연습 업무는 "오늘 만든 것이 있나", 정리는 service_heartbeat 한 줄(genesis_runs 의 kind 가 check 제약이라 새 종류를 못 넣는다).
 * 돈은 개발 계정 지갑에서만 나가고, 한도에 닿으면 손님 AI 를 부르기 전에 멈춘다.
 * 노트북 쪽 order_gen/order_score 는 그대로 있다(사람이 손으로 더 돌릴 때) — 서버 쪽은 표 파일 대신 DB 만 본다.
 */
type Db = SupabaseClient<any, any, any>;
const NL = String.fromCharCode(10);
export const kstDate = (now = new Date()) => new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
export const kstHour = (now = new Date()) => new Date(now.getTime() + 9 * 3600_000).getUTCHours();

const FACTS = [
  "회사: 고3 학생 1인 창업자. 제품 둘 — 로키(대화창에 말하면 게임·영상·문서 같은 진짜 파일이 나오는 서비스) · 별빛 플랫포머(브라우저 2D 점프 게임, 무대 3개, 목숨 3, 터치·키보드).",
  "로키 사실: 대화창에 말하면 mp4·문서 같은 진짜 파일로 나온다 / 이상한 부분만 말하면 그 부분만 다시 만든다 / 가입은 이메일과 비밀번호만, 카드는 안 받는다.",
  "별빛 플랫포머 화면 글자: 플랫포머 게임 · 새벽의 언덕 · 구름 다리 · 별빛 정상 · 클리어! · 게임 오버 · 모든 목숨을 잃었습니다. · 3개의 스테이지를 모두 통과했습니다! · 다시 플레이 · 처음부터 다시 시작 · 터치 조작",
  "분석에 쓸 수 있는 실제 주소: https://www.youtube.com/watch?v=09r1B9cVEQY (레벨 디자인 강연) · https://80.lv/articles/level-design-workshop-blockmesh-and-lighting-tips (글)",
].join(NL);
const orderSchema = z.object({ 주문: z.array(z.object({ 종류: z.enum(["분석", "발표", "문구", "번역", "자막", "그림", "현황판"]), 말: z.string(), 왜: z.string() })).min(1).max(6) });
const intakeSchema = z.object({ reply: z.string().nullable(), searches: z.array(z.string()), drawings: z.array(z.string()), capabilityId: z.string().nullable(), capabilityWhy: z.string().nullable() });

/** 접수가 고른 능력으로 업무를 만든다(engine/tools/order_dispatch.mts 와 같은 것 — 서버엔 engine 이 없어 여기로). */
export async function dispatchOrder(db: Db, CO: string, capabilityId: string, ask: string, ownerId: string): Promise<{ assignmentId: string; employee: string }> {
  const cap = capabilityCatalogue().find((c) => c.capabilityId === capabilityId);
  if (!cap) throw new Error("모르는 능력 " + capabilityId);
  const def = employeeDefinitions.find((e) => e.skillId === cap.skillId);
  if (!def) throw new Error("이 능력을 가진 직원 정의가 없다: " + cap.skillId);
  const { data: emp } = await db.from("employees").select("id, name").eq("slug", def.slug).maybeSingle();
  if (!emp) throw new Error("employees 표에 " + def.slug + " 이 없다");
  let { data: ce } = await db.from("company_employees").select("id").eq("company_id", CO).eq("employee_id", emp.id).maybeSingle();
  if (!ce) { const { data: made } = await db.from("company_employees").insert({ company_id: CO, employee_id: emp.id, onboarding_status: "completed", work_status: "ready" }).select("id").single(); ce = made; }
  await ensureKnowledgeProfile(db, CO, ce!.id as string);
  await releaseEmployee(db, ce!.id as string);
  const title = ask.split(NL)[0].replace(/[.。!]$/, "").slice(0, 100);
  const { data: conv } = await db.from("conversations").insert({ owner_id: ownerId, title: "[연습] " + title.slice(0, 50) }).select("id").single();
  const { data: a, error } = await db.from("assignments").insert({
    company_id: CO, company_employee_id: ce!.id, title, description: ask, status: "queued", priority: "normal",
    source_type: "manual", assignment_type: "manager", assignment_scope: "manager",
    role_input_schema_id: def.assignmentInputSchemaId, role_input_json: { capabilityId, collected: true, practice: true },
  }).select("id").single();
  if (error || !a) throw new Error("업무 못 만듦: " + (error?.message ?? "?"));
  if (conv) await db.from("conversation_messages").insert([
    { conversation_id: conv.id, role: "user", content: ask },
    { conversation_id: conv.id, role: "assistant", content: `${emp.name} 에게 맡겼어요. 끝나면 여기 붙여 드릴게요.`, attachments: { assignment: { id: a.id, title, queued: true } } },
  ]);
  await db.from("work_executions").insert({ company_id: CO, assignment_id: a.id, company_employee_id: ce!.id, status: "queued", current_step: "context_loaded", attempt_number: 1 });
  return { assignmentId: a.id as string, employee: emp.name as string };
}

/** 하루 한 번: 손님 AI 주문 n개 → 접수 → 업무. 자물쇠는 오늘 만든 연습 업무 수. */
export async function runPractice(db: Db, o: { companyId: string; n?: number; log: (m: string) => void; now?: Date }): Promise<{ ran: boolean; reason?: string; put?: number }> {
  const date = kstDate(o.now);
  // 자물쇠: genesis_runs 의 kind 는 check 제약으로 잠겨 있고 새 열을 만들 통로가 없다 → "오늘 만든 연습 업무가 있으면 오늘은 돌았다" 로 잰다.
  const since = new Date(Date.parse(date + "T00:00:00+09:00")).toISOString();
  const { count } = await db.from("assignments").select("id", { count: "exact", head: true }).eq("company_id", o.companyId).gte("created_at", since).contains("role_input_json", { practice: true });
  if ((count ?? 0) > 0) return { ran: false, reason: "오늘 이미 돌았다" };
  const finish = async (status: string, result: Record<string, unknown>) => { o.log(`${status}: ${JSON.stringify(result).slice(0, 300)}`); };
  try {
    const { data: co } = await db.from("companies").select("owner_id").eq("id", o.companyId).maybeSingle();
    if (!co) { await finish("failed", { why: "회사 없음" }); return { ran: false, reason: "회사 없음" }; }
    const seat = await seatProviderForCompany("gpt-5.6-luna", db, o.companyId);
    if (!seat.ai) { await finish("skipped", { why: seat.why }); o.log(`건너뜀: ${seat.why}`); return { ran: false, reason: seat.why }; }
    const n = o.n ?? 3;
    const { output: gen } = await seat.ai.generateStructuredOutput({
      systemInstructions: [
        "너는 이 회사의 사장(고3 학생, 1인 창업자)이다. AI 회사 로키의 대화창에 **오늘 실제로 시킬 법한 주문**을 쓴다.",
        "종류는 분석·발표·문구·번역·자막·그림·현황판 중에서 골고루(게임·영상은 빼라 — 값이 비싸다). 주문은 짧고 구체적으로, 사실이 필요하면 아래 사실만 '- ' 줄로 붙인다. 없는 숫자·이름·주소를 지어내지 마라.",
        "학생이 실제로 필요한 것(수행평가 발표·게임 홍보·영어판·자막·로고·강연 정리·오늘 현황판)으로. 같은 종류를 두 번 시키면 다른 결로. 답은 JSON 하나.",
      ].join(NL),
      input: `## 회사 사실${NL}${FACTS}${NL}${NL}주문 ${n}개.`,
      schema: orderSchema, schemaName: "customer_orders", maxTokens: 16000, tier: "judgment",
    });
    const ai = meterProviders(defaultProviders(), db, { companyId: o.companyId }).ai;
    const rows: Record<string, unknown>[] = []; let put = 0;
    for (const ord of gen.주문.slice(0, n)) {
      let cap: string | null = null, note = "";
      try {
        const w = await workStateText(db, o.companyId, null, ord.말);
        const r = await ai.generateStructuredOutput({
          systemInstructions: intakeInstructions({ hasImages: false, speaker: { name: "사장님", isOwner: true } }),
          input: (w.hasAny ? `${w.text}${NL}${NL}## 대화${NL}` : "") + `user: ${ord.말}`,
          schema: intakeSchema, schemaName: "everyday_plan", maxTokens: 16000, tier: "conversation",
        });
        cap = r.output.capabilityId;
        if (cap) { const d = await dispatchOrder(db, o.companyId, cap, ord.말, co.owner_id as string); note = d.employee; put++; }
        else note = "안 맡김";
      } catch (e) { note = "실패: " + (e instanceof Error ? e.message.slice(0, 80) : String(e)); }
      o.log(`[${ord.종류}] ${cap ?? "-"} · ${note}`);
      rows.push({ kind: ord.종류, ask: ord.말.slice(0, 200), capabilityId: cap, note });
    }
    await finish("done", { put, rows });
    return { ran: true, put };
  } catch (e) {
    await finish("failed", { why: e instanceof Error ? e.message : String(e) });
    return { ran: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** 정오 뒤: 오늘 연습 판을 세어 사장님 폰으로 한 줄. 자물쇠는 service_heartbeat "practice_summary" 줄. */
export async function runPracticeSummary(db: Db, o: { companyId: string; ownerEmail: string; log: (m: string) => void; now?: Date }): Promise<{ ran: boolean; reason?: string; body?: string }> {
  const date = kstDate(o.now);
  // 자물쇠: service_heartbeat 의 한 줄(service="practice_summary", commit_sha=날짜)을 빌린다 — 같은 이유(kind 제약).
  const { data: mark } = await db.from("service_heartbeat").select("commit_sha").eq("service", "practice_summary").maybeSingle();
  if (mark?.commit_sha === date) return { ran: false, reason: "오늘 이미 보냈다" };
  await db.from("service_heartbeat").upsert({ service: "practice_summary", commit_sha: date, seen_at: new Date().toISOString() }, { onConflict: "service" });
  const since = new Date(Date.parse(date + "T00:00:00+09:00")).toISOString();
  const { data: asg } = await db.from("assignments").select("id, status").eq("company_id", o.companyId).gte("created_at", since).contains("role_input_json", { practice: true }).limit(50);
  let pass = 0, total = 0, done = 0;
  for (const a of (asg ?? []) as { id: string; status: string }[]) {
    if (a.status === "completed" || a.status === "submitted") done++;
    const { data: d } = await db.from("deliverables").select("cases:content_json->verdict->cases").eq("assignment_id", a.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    for (const c of ((d?.cases as { result: string }[] | null) ?? [])) { total++; if (c.result === "Passed") pass++; }
  }
  const dev = await checkAllowance(db, o.companyId);
  let sent = 0, ownLine = "", body = "";
  try {
    const { data: us } = await db.auth.admin.listUsers({ perPage: 200 });
    const u = us.users.find((x) => x.email === o.ownerEmail);
    const { data: oc } = u ? await db.from("companies").select("id").eq("owner_id", u.id).maybeSingle() : { data: null };
    if (oc) { const own = await checkAllowance(db, oc.id as string); ownLine = ` · 사장님 지갑 $${own.spentUsd.toFixed(2)}/${own.limitUsd}`; }
    body = `연습 ${asg?.length ?? 0}판 중 끝남 ${done}${total ? ` · 자 ${pass}/${total}` : ""}${ownLine} · 개발 $${dev.spentUsd.toFixed(2)}/${dev.limitUsd}`;
    if (u) sent = (await pushToUser(db, u.id, { title: "로키 — 오늘 정리", body, url: "/ask", tag: "daily" })).sent;
  } catch (e) { o.log(`알림 실패: ${e instanceof Error ? e.message : e}`); }
  if (!body) body = `연습 ${asg?.length ?? 0}판 중 끝남 ${done}`;
  o.log(`${body} → 알림 ${sent}`);
  return { ran: true, body };
}
