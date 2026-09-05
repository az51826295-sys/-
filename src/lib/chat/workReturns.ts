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

type Row = {
  role: string;
  content: string;
  attachments: unknown;
  created_at: string;
};

/** `contents` 가 있으면 글 파일(브라우저가 연다), `href` 가 있으면 저장소 파일(서버를 거쳐 연다). */
export type ReturnedFile = { path: string; contents?: string; href?: string };
export type ReturnedTurn = { role: "assistant"; content: string; files?: ReturnedFile[] };

/** 아직 안 끝난 일과, 이번에 새로 붙인 턴. */
export type WorkReturns = { pending: number; posted: ReturnedTurn[] };

function assignmentIdOf(row: Row): string | null {
  const a = (row.attachments as { assignment?: { id?: unknown } } | null)?.assignment;
  return a && typeof a.id === "string" ? a.id : null;
}

function returnedIdOf(row: Row): string | null {
  const r = (row.attachments as { returned?: { assignmentId?: unknown } } | null)?.returned;
  return r && typeof r.assignmentId === "string" ? r.assignmentId : null;
}

/** 붙일 글. 사람 이름을 앞에 둔다 — 누가 한 일인지가 첫 줄이다. */
function finishedText(name: string, title: string, body: string): string {
  return `**${name}가 끝냈습니다 — ${title}**\n\n${body.trim()}`;
}

function failedText(name: string, title: string, why: string | null): string {
  return `**${name}가 못 했습니다 — ${title}**\n\n${why?.trim() || "이유가 기록되지 않았습니다. 다시 시켜 보십시오."}`;
}

// 끝난 것으로 치는 상태. `submitted` 는 산출물이 나온 것이고, 승인은 사람이
// 대화에서 하면 된다 — 승인 전이라고 안 보여 주면 볼 방법이 없다.
const DONE = new Set(["submitted", "completed"]);
const DEAD = new Set(["failed", "cancelled"]);

export async function collectWorkReturns(
  db: Supabase,
  conversationId: string,
): Promise<WorkReturns> {
  const { data: rows } = await db
    .from("conversation_messages")
    .select("role, content, attachments, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  const messages = (rows ?? []) as Row[];
  const returned = new Set(messages.map(returnedIdOf).filter((x): x is string => !!x));
  const waiting = messages
    .map(assignmentIdOf)
    .filter((x): x is string => !!x && !returned.has(x));

  if (waiting.length === 0) return { pending: 0, posted: [] };

  const { data: assignments } = await db
    .from("assignments")
    // 관계 이름을 박는다. assignments ↔ company_employees 는 길이 둘이라
    // (담당자 / 지금 하는 일) 이름 없이 부르면 PostgREST 가 거절한다(PGRST201).
    .select(
      "id, title, status, failure_reason, company_employee_id, " +
        "company_employees!assignments_company_employee_id_fkey(employees(name))",
    )
    .in("id", waiting);

  type A = {
    id: string;
    title: string;
    status: string;
    failure_reason: string | null;
    company_employee_id: string;
    company_employees: { employees: { name: string } | null } | null;
  };

  const posted: ReturnedTurn[] = [];
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
        .select("id, title, content_markdown, content_json")
        .eq("assignment_id", a.id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
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
        text = failedText(name, a.title, "끝났다고 적혀 있는데 산출물이 없습니다.");
      }
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
      // **죽은 실행을 죽었다고 적는다.** 서버가 배포로 재시작되면 그 안에서 돌던
      // 실행은 그냥 사라진다 — 행은 'running' 인 채로(09-05 17:57 에 실제로 그랬다:
      // Dev 의 유니티 판이 18분째 '생성 중'). 그러면 사람은 영영 기다리고 그 직원은
      // 영영 막힌다. 한 단계가 이만큼 오래 안 움직였으면 끊긴 것이다. 실패로 적어
      // 대화로 돌아오게 하고(다음 폴링), 사람이 다시 시키면 된다.
      await failIfStale(db, a.id, a.title);
      // 대기열에 있는 것은 누가 꺼내 줘야 시작된다. 그 사람이 실패한 일이나
      // 넘긴 일에 막혀 있으면 여기서 풀어 준다 — 화면이 열려 있는 한 대기열은
      // 저절로 움직인다.
      if (a.status === "waiting") await releaseEmployee(db, a.company_employee_id);
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

  return { pending, posted };
}


/** 한 단계가 이보다 오래 안 움직이면 끊긴 것으로 본다. 코드 생성이 제일 길고, 10분을 넘긴 적이 없다. */
const STALE_MS = 20 * 60_000;

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
