import type { Supabase } from "@/lib/execution/shared";
import { releaseEmployee } from "@/lib/assignments/service";

/**
 * 시킨 일이 끝나면 **그 대화로** 돌아온다.
 *
 * 대화는 "시간이 드는 일"이면 직원을 붙이고 실행까지 건다. 그 결과를 보던
 * 업무 화면은 2026-09-05 에 지웠다 — 로키는 `/ask` 한 화면이다. 그러면 결과가
 * 돌아올 자리는 이 대화뿐이고, 여기 안 오면 시킨 사람에게는 **아무 일도 안
 * 일어난 것**이 된다.
 *
 * 어느 턴이 어느 일을 시켰는지는 그 턴의 `attachments.assignment` 에 있다.
 * 끝난 것은 assistant 턴 하나로 붙이고, 붙였다는 표시(`attachments.returned`)를
 * 같이 남긴다 — 화면이 몇 초마다 물어보므로 **두 번 붙이지 않는 것**이 이
 * 함수의 반이다. 실패도 같은 자리로 온다. 조용히 없어지는 일은 없다.
 */

/** `contents` 가 있으면 글 파일(브라우저가 연다), `href` 가 있으면 저장소 파일(서버를 거쳐 연다). */
export type ReturnedFile = { path: string; contents?: string; href?: string };
export type ReturnedTurn = { role: "assistant"; content: string; files?: ReturnedFile[] };

/** 아직 안 끝난 일과, 이번에 새로 붙인 턴. */
/** 아직 안 끝난 일이 지금 어느 단계인지. 사람 말로 — 화면이 그대로 보여 준다. */
/** 계획 카드(UI B): 도는 동안 오른쪽 칸에 "무엇을, 기준 몇 개, 얼마쯤" 을 보인다. 단계 저장(steps.plan / steps.brief)에서 읽는다. */
export type PlanCard = { title: string; kind: string; lines: string[]; estimate: string };
export type WorkStep = { assignmentId: string; who: string; step: string; plan?: PlanCard };
export type WorkReturns = {
  pending: number;
  posted: ReturnedTurn[];
  /** 09-05 저녁: Rosebud 는 AI 가 코드를 쓰는 것이 보인다. 우리는 "끝나면 붙습니다"
   *  뿐이었다. 어느 단계인지라도 보인다. */
  steps: WorkStep[];
};

/** 실행 단계 이름을 사람 말로. 모르는 이름은 그대로 낸다 — 숨기면 더 모른다. */
const STEP_LABEL: Record<string, string> = {
  planning: "기준을 쓰는 중",
  generating: "코드를 쓰는 중",
  briefing: "요청을 정리하는 중",
  concept: "콘셉트 그림을 그리는 중",
  meshing: "3D 메시를 만드는 중",
  rigging: "뼈대를 넣는 중",
  judging: "자로 재는 중",
  storing: "파일을 저장하는 중",
  queued: "차례를 기다리는 중",
  waiting: "사장님 확인을 기다리는 중 — '시작' 이라고 하면 시작해요",
};

/**
 * 유니티 창이 붙인 턴(`attachments.unityChecks`) 중 `since` 뒤의 것. 그 턴은
 * 이 폴링이 아니라 /api/unity/checks 가 직접 넣어서, 화면이 열려 있어도 새로
 * 고치기 전엔 안 보였다. 이제 폴링이 집어 온다.
 */
export async function collectUnityChecks(
  db: Supabase,
  conversationId: string,
  since: string,
): Promise<ReturnedTurn[]> {
  const { data } = await db
    .from("conversation_messages")
    .select("content, attachments, created_at")
    .eq("conversation_id", conversationId)
    .gt("created_at", since)
    .or("attachments->unityChecks.not.is.null,attachments->approval.not.is.null,attachments->autoRetryExhausted.not.is.null")
    .order("created_at", { ascending: true });
  return ((data ?? []) as { content: string; attachments: { files?: ReturnedFile[] | null } | null }[]).map((m) => ({
    role: "assistant" as const,
    content: m.content,
    files: m.attachments?.files ?? undefined,
  }));
}

/** 붙일 글. 사람 이름을 앞에 둔다 — 누가 한 일인지가 첫 줄이다. */
function finishedText(name: string, title: string, body: string): string {
  return `**${name} · 작업 완료 · ${title}**\n\n${body.trim()}`;
}

function failedText(name: string, title: string, why: string | null): string {
  return `**${name} · 작업 실패 · ${title}**\n\n${why?.trim() || "이유가 남지 않았어요. 다시 시켜 주세요."}`;
}

// 끝난 것으로 치는 상태. `submitted` 는 산출물이 나온 것이고, 승인은 사람이
// 대화에서 하면 된다 — 승인 전이라고 안 보여 주면 볼 방법이 없다.
const DONE = new Set(["submitted", "completed"]);
const DEAD = new Set(["failed", "cancelled"]);

export async function collectWorkReturns(
  db: Supabase,
  conversationId: string,
): Promise<WorkReturns> {
  // 6초마다 도는 조회다. **필요한 두 칸만** 꺼낸다 — attachments 전체를 끌면 파일
  // 본문·그림이 딸려와 대화 하나에 수 MB 가 매 폴링마다 오갔고, 09-06 19:30 그 IO 로
  // DB 가 25분씩 두 번 멈췄다(images.ts).
  const { data: rows } = await db
    .from("conversation_messages")
    .select("assignmentId:attachments->assignment->>id, returnedId:attachments->returned->>assignmentId")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  const slim = (rows ?? []) as unknown as { assignmentId: string | null; returnedId: string | null }[];
  const returned = new Set(slim.map((r) => r.returnedId).filter((x): x is string => !!x));
  const waiting = slim
    .map((r) => r.assignmentId)
    .filter((x): x is string => !!x && !returned.has(x));

  if (waiting.length === 0) return { pending: 0, posted: [], steps: [] };

  const { data: assignments } = await db
    .from("assignments")
    // 관계 이름을 박는다. assignments ↔ company_employees 는 길이 둘이라
    // (담당자 / 지금 하는 일) 이름 없이 부르면 PostgREST 가 거절한다(PGRST201).
    .select(
      "id, title, status, failure_reason, company_employee_id, role_input_json, " +
        "company_employees!assignments_company_employee_id_fkey(employees(name))",
    )
    .in("id", waiting);

  type A = {
    id: string;
    title: string;
    status: string;
    failure_reason: string | null;
    company_employee_id: string;
    role_input_json: { awaitingApproval?: boolean } | null;
    company_employees: { employees: { name: string } | null } | null;
  };

  const posted: ReturnedTurn[] = [];
  const steps: WorkStep[] = [];
  let pending = 0;

  for (const a of (assignments ?? []) as unknown as A[]) {
    const name = a.company_employees?.employees?.name ?? "담당자";
    let text: string | null = null;
    let deliverableId: string | null = null;
    // Dev 가 만든 파일. 본문에도 코드 블록으로 있지만, 사람이 쓰는 것은 파일이다
    // — 저장해서 열어야 게임이 돈다. 그래서 따로 싣는다.
    let files: ReturnedFile[] | undefined;

    if (DONE.has(a.status)) {
      const { data: d } = await db
        .from("deliverables")
        .select("id, title, content_markdown, content_json, created_at")
        .eq("assignment_id", a.id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      // 파일이 아직 올라가는 중이면 붙이지 않는다. 산출물 행은 파일보다 먼저 생기고
      // 4K 캐릭터의 맵은 2분 더 걸린다(09-06 09:29) — 그 사이에 붙이면 반쪽 목록이고,
      // 유니티 창이 반쪽을 가져간다. 10분이 넘으면 끊긴 것으로 보고 있는 만큼 붙인다.
      const pendingFiles = !!(d?.content_json as { filesPending?: boolean } | null)?.filesPending;
      const startedAgo = d ? Date.now() - new Date((d as { created_at?: string }).created_at ?? 0).getTime() : 0;
      if (d && pendingFiles && startedAgo < 10 * 60_000) {
        pending += 1;
        steps.push({ assignmentId: a.id, who: name, step: "파일을 저장하는 중" });
        continue;
      }
      if (d) {
        deliverableId = d.id as string;
        text = finishedText(name, (d.title as string) || a.title, d.content_markdown as string);
        const made = (d.content_json as { files?: unknown } | null)?.files;
        if (Array.isArray(made)) {
          files = made
            .filter((f): f is { path: string; contents: string } =>
              !!f && typeof (f as ReturnedFile).path === "string" && typeof (f as ReturnedFile).contents === "string")
            .map((f) => ({ path: f.path, contents: f.contents }));
        }
        // 저장소에 둔 파일(메시·썸네일). 링크는 영구 주소 — 열 때 서명한다.
        const { data: stored } = await db
          .from("deliverable_files")
          .select("id, title, storage_path")
          .eq("deliverable_id", d.id as string)
          .order("created_at", { ascending: true });
        for (const f of (stored ?? []) as { id: string; title: string; storage_path: string }[]) {
          (files ??= []).push({
            path: f.storage_path.split("/").pop() ?? f.title,
            href: `/api/files/${f.id}`,
          });
        }
      } else {
        // 끝났다는데 산출물이 없다. 그것도 말한다 — 없는 것을 있는 것처럼
        // 기다리게 두면 사람은 영영 기다린다.
        text = failedText(name, a.title, "끝났다고 적혀 있는데 결과물이 없어요.");
      }
    } else if (a.status === "cancelled") {
      // 사장님이 접은 계획(되묻기에서 '취소'). 실패가 아니다.
      text = `**${name} · 접었어요 · ${a.title}**\n\n다시 시키실 때 말씀해 주세요.`;
    } else if (DEAD.has(a.status)) {
      // failure_reason 은 코드(UNKNOWN_ERROR)뿐이라 사람이 읽을 게 없다. 실행 행의
      // 오류 문장을 같이 보여 준다 — 09-05 에 "UNKNOWN_ERROR" 만 보고 아무도 무엇이
      // 잘못됐는지 몰랐다. 길면 자른다.
      const { data: ex } = await db
        .from("work_executions")
        .select("error_message")
        .eq("assignment_id", a.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const detail = (ex?.error_message as string | null)?.slice(0, 300);
      text = failedText(name, a.title, detail ? `${a.failure_reason ?? ""} — ${detail}` : a.failure_reason);
    }

    if (text === null) {
      pending += 1;
      steps.push({ assignmentId: a.id, who: name, ...(await stepOf(db, a.id, a.status)) });
      // **죽은 실행을 죽었다고 적는다.** 서버가 배포로 재시작되면 그 안에서 돌던
      // 실행은 그냥 사라진다 — 행은 'running' 인 채로(09-05 17:57 에 실제로 그랬다:
      // Dev 의 유니티 판이 18분째 '생성 중'). 그러면 사람은 영영 기다리고 그 직원은
      // 영영 막힌다. 한 단계가 이만큼 오래 안 움직였으면 끊긴 것이다. 실패로 적어
      // 대화로 돌아오게 하고(다음 폴링), 사람이 다시 시키면 된다.
      await failIfStale(db, a.id, a.title);
      // 대기열에 있는 것은 누가 꺼내 줘야 시작된다. 그 사람이 실패한 일이나
      // 넘긴 일에 막혀 있으면 여기서 풀어 준다 — 화면이 열려 있는 한 대기열은
      // 저절로 움직인다.
      // 42회차: 사람 답을 기다리는 판(계획 확인)은 풀지 않는다 — 풀면 대기열이 집어가 승인 없이 돈다.
      if (a.status === "waiting" && !(a.role_input_json as { awaitingApproval?: boolean } | null)?.awaitingApproval) {
        await releaseEmployee(db, a.company_employee_id);
      }
      continue;
    }

    const { error } = await db.from("conversation_messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: text,
      attachments: { returned: { assignmentId: a.id, deliverableId }, files: files ?? null },
    });
    // 못 붙였으면 다음에 다시 시도한다 — 표시가 안 남았으니 다시 잡힌다.
    if (!error) {
      posted.push({ role: "assistant", content: text, files });
      // 대화에 붙은 것이 곧 승인이다(끝난 것) / 접는 것이다(실패). 그래야 그
      // 사람이 다음 일을 받는다. 기다리던 일이 있으면 여기서 시작된다.
      await releaseEmployee(db, a.company_employee_id, a.id);
    } else pending += 1;
  }

  return { pending, posted, steps };
}

async function stepOf(db: Supabase, assignmentId: string, status: string): Promise<{ step: string; plan?: PlanCard }> {
  const { data } = await db
    .from("work_executions")
    .select("current_step, status, steps:metrics_json->steps")
    .eq("assignment_id", assignmentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // 되묻기(35회차): 계획을 보이고 멈춘 업무. 카드는 그 실행의 저장된 계획에서.
  if (status === "waiting") return { step: STEP_LABEL.waiting, plan: planCardOf((data as { steps?: unknown } | null)?.steps) };
  const raw = (data?.current_step as string | null) ?? (data ? "running" : "queued");
  return { step: STEP_LABEL[raw] ?? raw, plan: planCardOf((data as { steps?: unknown } | null)?.steps) };
}

/** 저장된 단계에서 계획 카드를 만든다. Dev 는 plan(제목·기준), Vox 는 brief(대상·초안/고화질·필수 조건). */
function planCardOf(steps: unknown): PlanCard | undefined {
  const s = (steps ?? {}) as {
    plan?: { title?: string; target?: string; criteria?: { when: string; then: string }[]; expectations?: { measure: string; min: number | null; max: number | null; equals: boolean | null; why: string }[] };
    brief?: { subject?: string; wantFinal?: boolean; wantRig?: boolean; mustHave?: string[] };
  };
  if (s.plan?.title) {
    const c = s.plan.criteria ?? [];
    // 숫자 기대치가 먼저(되묻기의 알맹이), 그 다음 기준 몇 줄.
    const ex = (s.plan.expectations ?? []).map((e) => `${e.why} — ${e.measure} ${typeof e.equals === "boolean" ? (e.equals ? "예" : "아니오") : `${e.min ?? ""}~${e.max ?? ""}`}`);
    return {
      title: s.plan.title,
      kind: s.plan.target === "unity" ? "게임(유니티)" : "앱",
      lines: ex.concat(c.slice(0, Math.max(1, 4 - ex.length)).map((x) => `${x.when} → ${x.then}`)).concat(c.length > 4 ? [`… 기준 ${c.length}개`] : []),
      estimate: "약 $0.2 · 5분 · 크레딧 0",
    };
  }
  if (s.brief?.subject) {
    const final = !!s.brief.wantFinal;
    return {
      title: s.brief.subject,
      kind: final ? "3D 자산(고화질)" : "3D 자산(초안)",
      lines: (s.brief.mustHave ?? []).slice(0, 5),
      estimate: final ? `약 $1.5 · 10분 · 크레딧 ${s.brief.wantRig ? 35 : 30}` : "약 $0.25 · 2분 · 크레딧 0 — 그림 한 장만",
    };
  }
  return undefined;
}


/** 한 단계가 이보다 오래 안 움직이면 끊긴 것으로 본다. 코드 생성이 제일 길고, 10분을 넘긴 적이 없다. */
const STALE_MS = 40 * 60_000; // 00:19 파일 9개 되쓰는 판이 20분에 죽었다 — 서버는 멀쩡했다

async function failIfStale(db: Supabase, assignmentId: string, title: string): Promise<void> {
  const { data: e } = await db
    .from("work_executions")
    .select("id, status, updated_at, current_step")
    .eq("assignment_id", assignmentId)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!e) return;
  const age = Date.now() - new Date(e.updated_at as string).getTime();
  if (age < STALE_MS) return;
  await db.rpc("fail_work_execution", {
    p_execution_id: e.id,
    p_error_code: "UNKNOWN_ERROR",
    p_error_message: `'${e.current_step}' 단계에서 ${Math.round(age / 60_000)}분 동안 소식이 없다 — 서버가 재시작돼 실행이 끊긴 것으로 본다 (${title}).`,
  });
}
