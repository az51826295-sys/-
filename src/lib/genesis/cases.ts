import type { Supabase } from "@/lib/execution/shared";
import { isBadForLearning, verdictLine } from "@/lib/genesis/verdictLabel";
import { labelReactions, type Turn } from "@/lib/genesis/reaction";
import type { AIProvider } from "@/lib/providers/types";

/**
 * 학습 사례 모으기 (100회차 09-14). 규칙을 제안하고 검증할 재료 — "무엇을 시켰고, 무엇이 나왔고, 잘됐나".
 *
 * 세 곳에서 온다. 전부 **이미 일어난 일**이고, 새로 판정을 만들지 않는다.
 *   review    **사장님이 직접 누른 것** — 승인 / 수정 요청 / 버리기. 151회차에 이었다.
 *             이게 유일한 정답이다(09-16). 그래서 같은 결과물에 기계 판정이 있어도 **사람 쪽이 이긴다** — 기계는 통과라 해도
 *             사장님이 수정 요청을 눌렀으면 그 판은 실패다. 한 결과물이 사례 둘로 세어지지 않게 verdict 쪽을 건너뛴다.
 *             ("버리기" 는 승인도 수정 요청도 아닌 것 — 그냥 아니었던 것이라, 실패로 센다.)
 *   verdict   결과물의 자동 검사 판정(PASS=성공, FAIL/PARTIAL=실패). 사람 판정이 없을 때의 신호.
 *   execution 품질 때문에 실패한 실행(자기모순·맥락 부족·출력 잘림). 인프라 오류(시간 초과·잔액·알 수 없음)는 **뺀다** —
 *             규칙으로 고칠 수 있는 게 아니다.
 *   unity     유니티 검사 턴(`attachments.unityChecks`, "통과 N · 실패 M")이 가리키는 결과물 — 실패>0 이면 실패. 사람 말과 무관한
 *             **기계 판정**이라 chat 보다 믿을 만하다(104회차: 65건이 안 쓰이고 있었다). 검사 글 자체는 결과를 드러내므로 사례의
 *             결과물 칸에는 검사 글이 아니라 **결과물 본문**을 둔다.
 *   chat      AI 답 바로 다음 사람 말에 "다시·아니·틀렸·잘못·안 돼" 가 있으면 실패, 없으면 성공. 일이 돌아온 턴(returned)·검사 턴·
 *             스스로 고치기 알림은 사람에게 한 답이 아니라 **빼고**(위 두 갈래가 맡는다) 접수 답만 본다.
 *
 * `note`(무엇이 잘못됐나)는 **제안 단계에만** 보인다. 검증 단계에는 task·output 만 가고 결과는 가린다(블라인드).
 */
export type LearnCase = {
  id: string;
  source: "verdict" | "execution" | "unity" | "chat" | "review";
  task: string;
  output: string;
  bad: boolean;
  note: string;
  at: string;
};

const QUALITY_CODES = new Set(["SELF_INCONSISTENT", "CONTEXT_INCOMPLETE"]);
const clip = (s: string | null | undefined, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/**
 * @param opts.ai 156회차: 있으면 사장님 반응을 **모델이 읽는다**(`reaction.ts`). 없으면 정규식(난간).
 *   목(mock) 파일럿과 돈 0 자들은 안 줘도 된다 — 그때는 예전과 똑같이 돈다.
 */
export async function collectCases(db: Supabase, companyId: string, opts: { limit?: number; ai?: AIProvider | null } = {}): Promise<LearnCase[]> {
  const limit = opts.limit ?? 160;
  const out: LearnCase[] = [];

  // ── verdict
  const { data: dels } = await db
    .from("deliverables")
    // 유니티 결과물의 본문은 '실행 방법 + 합격 기준 43줄' 이라 600자 안엔 볼 게 없다(105회차 실제 판: 규칙 3개가 보류 59건에서 어긴 사례 0·1·0).
    // 판정자가 볼 것을 따로 집는다 — 바뀐 파일 이름(verify.files, 내용 없이 경로만)·기준 지킴 요약·기대치 주장·실행 방법. 검사 결과(unityChecks)는 답을 흘리니 안 집는다.
    .select("id, assignment_id, created_at, content_markdown, verdict:content_json->verdict, vfiles:content_json->verify->files, summary:content_json->summary, howToRun:content_json->howToRun, expectations:content_json->expectations, coverage:content_json->coverage")
    .eq("company_id", companyId);
  type DelRow = {
    id: string; assignment_id: string | null; created_at: string; content_markdown: string | null; verdict: Record<string, unknown> | null;
    vfiles: { path?: string }[] | null; summary: { met?: number; criteria?: number } | null; howToRun: string | null;
    expectations: { measure?: string; min?: number | null; max?: number | null; equals?: unknown }[] | null; coverage: { met?: boolean; where?: string; criterionId?: string }[] | null;
  };
  const delRows = (dels ?? []) as DelRow[];
  const unityOutput = (d: DelRow): string => {
    const paths = (d.vfiles ?? []).map((f) => f.path ?? "").filter(Boolean);
    const parts = [
      paths.length ? `바뀐 파일 ${paths.length}개: ${paths.slice(0, 8).map((p) => p.split("/").pop()).join(", ")}${paths.length > 8 ? " …" : ""}` : "",
      d.summary && typeof d.summary.criteria === "number" ? `합격 기준 ${d.summary.met ?? 0}/${d.summary.criteria} 지킴(자기 보고)` : "",
      d.expectations?.length ? `기대치 주장: ${d.expectations.slice(0, 6).map((e) => `${e.measure ?? "?"} ${e.equals !== null && e.equals !== undefined ? `=${String(e.equals)}` : `${e.min ?? ""}~${e.max ?? ""}`}`).join(", ")}` : "",
      d.coverage?.length ? `기준 대응: ${d.coverage.slice(0, 4).map((c) => `${c.met ? "됨" : "안 됨"} ${clip(c.where, 90)}`).join(" / ")}` : "",
      d.howToRun ? `실행 방법: ${clip(d.howToRun, 260)}` : "",
    ].filter(Boolean);
    return parts.length ? parts.join("\n") : clip(d.content_markdown, 600) || "(본문 없음)";
  };
  const judged = delRows.filter((d) => ["PASS", "FAIL", "PARTIAL"].includes(String(d.verdict?.verdict ?? "")));

  // ── execution (품질 실패만)
  const { data: execs } = await db
    .from("work_executions")
    .select("id, assignment_id, error_code, error_message, created_at")
    .eq("company_id", companyId)
    .eq("status", "failed");
  const qualityFails = ((execs ?? []) as { id: string; assignment_id: string | null; error_code: string | null; error_message: string | null; created_at: string }[]).filter(
    (e) => QUALITY_CODES.has(e.error_code ?? "") || (e.error_message ?? "").includes("MODEL_OUTPUT_TRUNCATED"),
  );

  // ── unity (회사 주인의 대화에 붙은 검사 턴 → 결과물)
  const { data: co } = await db.from("companies").select("owner_id").eq("id", companyId).maybeSingle();
  const owner = (co?.owner_id as string | undefined) ?? null;
  const convIds: string[] = [];
  if (owner) {
    const { data: convs } = await db.from("conversations").select("id").eq("owner_id", owner).limit(200);
    for (const c of (convs ?? []) as { id: string }[]) convIds.push(c.id);
  }
  const unityLabel = new Map<string, { fail: number; lines: string }>();
  if (convIds.length) {
    const { data: checks } = await db
      .from("conversation_messages")
      .select("content, created_at, unity:attachments->unityChecks")
      .in("conversation_id", convIds)
      .not("attachments->unityChecks", "is", null)
      .order("created_at", { ascending: true });
    for (const m of (checks ?? []) as { content: string; unity: { deliverableId?: string } | null }[]) {
      const hit = m.content.match(/통과 (\d+) · (?:실패|떨어짐) (\d+)/);
      const id = m.unity?.deliverableId;
      if (!hit || !id) continue;
      // 123회차: 떨어진 줄을 **원인 단위로** 적는다. 유니티 러너는 예외 하나가 나면 그 판의 검사 전부에 같은 글을 달아
      // 실패로 적는다(122회차) — 그대로 넘기면 제안자가 "고칠 곳 네 군데" 로 읽는다. 같은 예외는 한 줄로, 잴 수 없던
      // 기대치(폭 0, 119회차)는 빼고 넘긴다. 사례의 실패/통과 자체는 안 건드린다 — 그건 서버 자가 정한다.
      const seenExc = new Set<string>();
      const lines = m.content
        .split("\n")
        .filter((l) => l.trim().startsWith("- ❌"))
        .map((l) => l.replace(/^- ❌\s*/, "").trim())
        .filter((l) => !/기대 ([\d.]+)~\1(?:$|\s|,)/.test(l))
        .filter((l) => {
          const r = l.match(/Unhandled log message:\s*'?\[(?:Exception|Error)\]\s*([^']{10,160}?)\s*(?:\.|')/)?.[1];
          if (!r) return true;
          if (seenExc.has(r)) return false;
          seenExc.add(r);
          return true;
        })
        .join(" / ");
      unityLabel.set(id, { fail: Number(hit[2]), lines }); // 같은 결과물을 여러 번 쟀으면 마지막 판정
    }
  }
  const judgedIds = new Set(judged.map((d) => d.id));
  const unityDels = delRows.filter((d) => unityLabel.has(d.id) && !judgedIds.has(d.id));

  const assignmentIds = [...new Set([...judged, ...qualityFails, ...unityDels].map((r) => r.assignment_id).filter(Boolean))] as string[];
  const tasks = new Map<string, string>();
  if (assignmentIds.length) {
    const { data: as } = await db.from("assignments").select("id, title, description").in("id", assignmentIds);
    for (const a of (as ?? []) as { id: string; title: string | null; description: string | null }[]) tasks.set(a.id, clip(`${a.title ?? ""} — ${a.description ?? ""}`, 400));
  }

  // ── review (사람이 누른 것). 결과물 본문·업무는 verdict 쪽과 같은 재료를 쓴다.
  const delIds = delRows.map((d) => d.id);
  const humans = new Map<string, { bad: boolean; how: string; why: string; at: string }>();
  if (delIds.length) {
    const { data: rv } = await db
      .from("deliverable_reviews").select("deliverable_id, decision, feedback, created_at").in("deliverable_id", delIds);
    for (const r of (rv ?? []) as { deliverable_id: string; decision: string; feedback: string | null; created_at: string }[]) {
      const ok = r.decision === "approved";
      humans.set(r.deliverable_id, { bad: !ok, how: ok ? "승인" : "수정 요청", why: clip(r.feedback, 300), at: r.created_at });
    }
  }
  // 버린 판(136회차 소프트 삭제)도 사람의 반응이다 — 결과 턴에 표시만 남아 있어서 대화 쪽에서 집는다.
  {
    const { data: co0 } = await db.from("companies").select("owner_id").eq("id", companyId).maybeSingle();
    const own = (co0?.owner_id as string | undefined) ?? null;
    if (own) {
      const { data: cv } = await db.from("conversations").select("id").eq("owner_id", own).limit(200);
      const ids = ((cv ?? []) as { id: string }[]).map((c) => c.id);
      if (ids.length) {
        const { data: ms } = await db
          .from("conversation_messages").select("created_at, returned:attachments->returned").in("conversation_id", ids).limit(2000);
        for (const m of (ms ?? []) as { created_at: string; returned: { deliverableId?: string; discarded?: boolean } | null }[]) {
          const id = m.returned?.deliverableId;
          if (!id || !m.returned?.discarded || humans.has(id)) continue;
          humans.set(id, { bad: true, how: "버림", why: "", at: m.created_at });
        }
      }
    }
  }
  for (const d of delRows) {
    const h = humans.get(d.id);
    if (!h) continue;
    out.push({
      id: `r:${d.id}`,
      source: "review",
      task: tasks.get(d.assignment_id ?? "") ?? "(업무 설명 없음)",
      output: clip(d.content_markdown, 600) || "(본문 없음)",
      bad: h.bad,
      note: h.bad ? clip(`사장님이 ${h.how}${h.why ? `: ${h.why}` : ""}`, 300) : "",
      at: h.at,
    });
  }

  for (const d of judged) {
    // 사람이 이미 본 판은 사람 쪽으로만 센다(위). 기계 판정과 둘로 세면 같은 판이 두 표를 갖는다.
    if (humans.has(d.id)) continue;
    const v = String(d.verdict?.verdict);
    out.push({
      id: `d:${d.id}`,
      source: "verdict",
      task: tasks.get(d.assignment_id ?? "") ?? "(업무 설명 없음)",
      output: clip(d.content_markdown, 600) || "(본문 없음)",
      // 129회차: 주장형 판정(분석)은 비율로 본다 — 99개 중 97개 맞힌 판을 실패 사례로 세면 "말을 아껴라" 를 배운다.
      bad: isBadForLearning(d.verdict as never),
      note: clip(`판정 ${verdictLine(d.verdict as never)}: ${JSON.stringify(d.verdict)}`, 400),
      at: d.created_at,
    });
  }
  for (const d of unityDels) {
    const u = unityLabel.get(d.id)!;
    out.push({
      id: `u:${d.id}`,
      source: "unity",
      task: tasks.get(d.assignment_id ?? "") ?? "(업무 설명 없음)",
      output: unityOutput(d),
      bad: u.fail > 0,
      note: u.fail > 0 ? clip(`유니티 검사 떨어진 줄: ${u.lines}`, 400) : "",
      at: d.created_at,
    });
  }
  for (const e of qualityFails) {
    out.push({
      id: `e:${e.id}`,
      source: "execution",
      task: tasks.get(e.assignment_id ?? "") ?? "(업무 설명 없음)",
      // 결과물이 없다는 것 자체가 결과를 드러낸다 — 그래서 실행 실패 사례는 **제안에만** 쓰고 블라인드 검증에는 안 넣는다(ruleLoop).
      output: "(결과물 없음)",
      bad: true,
      note: clip(`${e.error_code ?? ""} ${e.error_message ?? ""}`, 300),
      at: e.created_at,
    });
  }

  // ── chat (회사 주인의 대화)
  if (owner) {
    if (convIds.length) {
      const { data: msgs } = await db
        .from("conversation_messages")
        .select("id, conversation_id, role, content, created_at, attachments")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: true })
        .limit(2000);
      const byConv = new Map<string, { id: string; role: string; content: string; created_at: string; attachments: Record<string, unknown> | null }[]>();
      for (const m of (msgs ?? []) as { id: string; conversation_id: string; role: string; content: string; created_at: string; attachments: Record<string, unknown> | null }[]) {
        // 일이 돌아온 턴·검사 턴·스스로 고치기 알림은 사람에게 한 답이 아니다(verdict/unity 갈래가 맡는다). 통째로 뺀다 —
        // 104회차 감사: '못 했습니다' 1건·'접었어요' 3건·'검사 실패>0' 2건이 다음 사람 말에 낱말이 없다고 성공으로 세어져 있었다.
        const a = m.attachments ?? {};
        if (m.role === "assistant" && ("returned" in a || "unityChecks" in a || "autoRetry" in a || "autoRetryExhausted" in a)) continue;
        const list = byConv.get(m.conversation_id) ?? [];
        list.push({ id: m.id, role: m.role, content: m.content, created_at: m.created_at, attachments: m.attachments });
        byConv.set(m.conversation_id, list);
      }
      // 사람 말과 답은 같은 created_at 으로 저장된다(saveTurn). 시각만으로 세우면 답이 질문 앞에 서서, 그 답을
      // **앞 질문의 답**으로 잘못 짝짓고 다음 사람 말로 채점했다(103회차 감사: "투구 다시 만들자" 답이 앞 턴에 붙음).
      for (const list of byConv.values()) list.sort((x, y) => (x.created_at < y.created_at ? -1 : x.created_at > y.created_at ? 1 : (x.role === "user" ? 0 : 1) - (y.role === "user" ? 0 : 1)));
      // 사람 말 하나 = 사례 하나: 그 말 **바로 앞의 AI 답**을 그 말로 채점한다. (첫 판은 AI 답마다 다음 사람 말을 붙여서
      // 연달아 나온 답 여럿이 같은 "다시" 한 번으로 모두 실패가 됐다 — 사람 줄 28개가 실패 97건으로 불었다.)
      const pairs: { m: { id: string; content: string; created_at: string }; prev: string; turn: Turn }[] = [];
      for (const list of byConv.values()) {
        for (let j = 0; j < list.length; j++) {
          const next = list[j];
          if (next.role !== "user") continue;
          let ai = -1;
          for (let k = j - 1; k >= 0 && list[k].role !== "user"; k--) if (list[k].role === "assistant") { ai = k; break; }
          if (ai < 0) continue;
          const prev = [...list.slice(0, ai)].reverse().find((x) => x.role === "user");
          if (!prev) continue;
          const m = list[ai];
          pairs.push({ m, prev: prev.content, turn: { id: next.id, order: prev.content, answer: m.content, reply: next.content, attachments: next.attachments } });
        }
      }
      // 156회차: 사람 반응은 정규식이 아니라 **AI 가 읽는다**(`reaction.ts`). 읽은 것은 사람 말에 붙어 다시 안 읽는다.
      const reactions = await labelReactions(pairs.map((p) => p.turn), { ai: opts.ai ?? null, db });
      for (const { m, prev, turn } of pairs) {
        const r = reactions.get(turn.id);
        const bad = r?.rejected ?? false;
        out.push({
          id: `c:${m.id}`, source: "chat", task: clip(prev, 400), output: clip(m.content, 600), bad,
          note: bad ? clip(`다음 사람 말: ${turn.reply}${r?.by === "ai" ? ` — 읽음: ${r.why}` : ""}`, 300) : "",
          at: m.created_at,
        });
      }
    }
  }

  // 실패는 드물어서 전부 남기고, 성공은 최근 것부터 채운다.
  const bads = out.filter((c) => c.bad);
  const goods = out.filter((c) => !c.bad).sort((x, y) => (x.at < y.at ? 1 : -1)).slice(0, Math.max(0, limit - bads.length));
  return [...bads, ...goods];
}
