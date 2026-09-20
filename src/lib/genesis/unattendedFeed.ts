import type { SupabaseClient } from "@supabase/supabase-js";

type Supabase = SupabaseClient;

/**
 * **무인 판 결과를 볼 자리** (202회차 09-21). 사장님이 ㉠(전용 대화)을 고르며 조건 둘을 달았다.
 *
 * **조건 1 — 쌓이기만 하는 자리는 안 본다.**
 * *"전용 대화에 8개, 다음 판에 20개가 쌓이면 일요일 밤 시간이 거기로 들어가요."*
 * 그래서 **한 판에 한 턴**만 붙인다(묶음 요약). 그 안에서:
 * - 심판이 **통과**시킨 것 → 볼 값어치가 있다(쓸 수 있는 결과물). 제목·한 줄·파일 링크를 편다.
 * - **못 잼** → 기계가 판단 못 했다. **사람 판단이 필요한 것은 이것뿐이다.** 편다.
 * - **걸린 것** → 기계가 이미 판정했다. 사람이 다시 볼 필요 없다. **한 줄로 접는다.**
 *
 * **조건 2 — 이 자리가 다시 사람 손을 기다리는 자리가 되면 안 된다.**
 * *"산출물을 붙이는 게 releaseEmployee 를 부르는 경로와 얽히면, 어제 푼 매듭이 다른 모양으로 돌아와요."*
 * 그래서 붙이는 턴에 **`attachments.assignment` 를 쓰지 않는다**(`attachments.unattended` 를 쓴다):
 * - 쓸기(`sweepTick`)는 `attachments.assignment` 가 **없는** 일만 푼다 → 이 턴이 있어도 계속 푼다
 * - 결과 붙이기(`collectWorkReturns`)는 `attachments.assignment` 를 찾는다 → 이 턴을 안 집는다
 * **붙이기는 일의 완료와 완전히 무관하다.** 아무도 안 열어 봐도 다음 일이 돈다(자: `feed_probe.mts`).
 */

const TITLE = "무인 판 결과";

/** 그 회사 주인의 '무인 판 결과' 대화. 없으면 만든다. */
export async function feedConversation(db: Supabase, companyId: string): Promise<string | null> {
  const { data: co } = await db.from("companies").select("owner_id").eq("id", companyId).maybeSingle();
  if (!co) return null;
  const { data: found } = await db.from("conversations").select("id").eq("owner_id", co.owner_id).eq("title", TITLE).limit(1).maybeSingle();
  if (found) return found.id as string;
  const { data: made } = await db.from("conversations").insert({ owner_id: co.owner_id, title: TITLE }).select("id").maybeSingle();
  return (made?.id as string | undefined) ?? null;
}

type Row = { id: string; title: string; company_id: string; content_json: Record<string, unknown> | null };

/** 기계 판정 세 값. 사람이 볼 것은 통과·못 잼 둘뿐이다. */
function verdictOf(cj: Record<string, unknown> | null): { kind: "통과" | "못 잼" | "걸림"; note: string } {
  const loop = cj?.loop as { rounds?: { met: number; unmet: number; broken: number }[]; verdict?: { toPerson?: string } } | null;
  const ask = cj?.askJudge as { verdict?: string; toPerson?: string } | null;
  if (ask?.verdict === "되돌린다") return { kind: "걸림", note: ask.toPerson ?? "검토에서 되돌림" };
  const last = loop?.rounds?.[loop.rounds.length - 1];
  if (!last) return { kind: "못 잼", note: "돌려 보지 못했어요 — 사람이 봐야 해요" };
  if (last.unmet === 0 && last.broken === 0) return { kind: "통과", note: loop?.verdict?.toPerson ?? "확인 목록을 통과했어요" };
  return { kind: "걸림", note: loop?.verdict?.toPerson ?? `안 맞음 ${last.unmet} · 고장 ${last.broken}` };
}

/**
 * 아직 안 붙인 무인 산출물을 **한 턴으로 묶어** 붙인다. 붙인 개수를 돌려준다.
 * 어느 일도 건드리지 않는다 — 읽고 쓰는 것은 대화뿐이다.
 */
export async function postUnattendedFeed(db: Supabase, log: (m: string) => void): Promise<number> {
  // 무인 표시가 붙은 업무의 산출물
  const { data: asg } = await db.from("assignments").select("id, company_id").eq("role_input_json->>unattended", "true").limit(200);
  const ids = (asg ?? []).map((a) => a.id as string);
  if (!ids.length) return 0;
  const { data: dls } = await db.from("deliverables").select("id, title, company_id, content_json, assignment_id, created_at").in("assignment_id", ids).order("created_at");
  if (!dls?.length) return 0;
  // 이미 붙인 것 거르기
  const { data: posted } = await db.from("conversation_messages").select("did:attachments->unattended->>deliverableId").not("attachments->unattended", "is", null).limit(500);
  const done = new Set(((posted ?? []) as unknown as { did: string | null }[]).map((p) => p.did).filter(Boolean));
  const fresh = (dls as unknown as Row[]).filter((d) => !done.has(d.id));
  if (!fresh.length) return 0;

  // 회사별로 한 턴
  let total = 0;
  for (const companyId of [...new Set(fresh.map((d) => d.company_id))]) {
    const mine = fresh.filter((d) => d.company_id === companyId);
    const convId = await feedConversation(db, companyId);
    if (!convId) continue;
    const judged = mine.map((d) => ({ d, v: verdictOf(d.content_json) }));
    const up = judged.filter((x) => x.v.kind !== "걸림");
    const folded = judged.filter((x) => x.v.kind === "걸림");
    const lines = [
      `**무인 판 결과 ${mine.length}개** — 통과 ${judged.filter((x) => x.v.kind === "통과").length} · 사람이 볼 것 ${judged.filter((x) => x.v.kind === "못 잼").length} · 걸린 것 ${folded.length}`,
      "",
      ...up.map((x) => `- **${x.v.kind === "통과" ? "✅" : "❔"} ${x.d.title}** — ${x.v.note}\n  [열기](/api/deliverables/${x.d.id}/play/)`),
      ...(folded.length ? ["", `그 외 ${folded.length}개는 확인에서 걸렸어요 — 기계가 이미 판정했으니 안 보셔도 돼요. (${folded.map((x) => x.d.title).slice(0, 4).join(", ")}${folded.length > 4 ? " …" : ""})`] : []),
    ];
    const { error } = await db.from("conversation_messages").insert({
      conversation_id: convId, role: "assistant", content: lines.join("\n"),
      // **`assignment` 를 쓰지 않는다** — 쓰면 쓸기가 이 일을 안 풀어 어제의 매듭이 돌아온다(조건 2).
      attachments: { unattended: { deliverableId: mine[0].id, all: mine.map((d) => d.id), at: new Date().toISOString() } },
    });
    if (error) { log(`무인 결과 못 붙임: ${error.message}`); continue; }
    // 한 턴에 여러 개를 담았으므로, 나머지도 붙인 것으로 표시(빈 턴 없이)
    for (const d of mine.slice(1)) {
      await db.from("conversation_messages").insert({ conversation_id: convId, role: "assistant", content: "", attachments: { unattended: { deliverableId: d.id, rolledInto: mine[0].id } } });
    }
    total += mine.length;
    log(`무인 결과 ${mine.length}개를 한 턴으로 붙임 → 대화 ${convId.slice(0, 8)}`);
  }
  return total;
}
