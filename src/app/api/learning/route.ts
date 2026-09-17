import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/**
 * 회사가 배운 것 (109회차 09-14, 사장님 "자가진화").
 *
 * 규칙 고리(genesis/ruleLoop)가 매일 규칙을 채택하고 내리는데, 그게 DB 에만 남아서 사장님은 무엇을 배웠는지 알 길이 없었고
 * 잘못 배운 규칙을 끌 수도 없었다. 이 문이 그걸 보여 주고, 끄게 한다.
 *   GET  → 지키는 규칙(검증된 것만) · 최근 시험(채택/떨어짐 + 수치) · 매일 실행 기록(최근 7일)
 *   POST { knowledgeId } → 그 규칙을 내린다(deprecated). 사용자 세션으로 쓴다 — RLS(update_own)가 회사 주인만 허락한다.
 * genesis_runs 는 정책이 없어(워커 전용) 회사 주인임을 확인한 뒤 서비스 키로 읽고, 그 회사 몫만 잘라 준다.
 */
type Metrics = { counts?: { a: number; b: number; c: number; d: number }; lift?: number | null; p?: number; holdout?: number; violation_test?: string };
const parse = (s: string | null): Metrics => { try { return JSON.parse(s ?? "{}") as Metrics; } catch { return {}; } };

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { data: co } = await supabase.from("companies").select("id").eq("owner_id", user.id).maybeSingle();
  if (!co) return Response.json({ rules: [], recent: [], runs: [] });

  const [{ data: k }, { data: c }] = await Promise.all([
    supabase.from("organization_knowledge").select("id, title, description, created_at, learning_candidate_id").eq("company_id", co.id).eq("status", "active").not("learning_candidate_id", "is", null).order("created_at", { ascending: false }),
    supabase.from("learning_candidates").select("id, title, summary, status, reason, manager_note, created_at").eq("company_id", co.id).order("created_at", { ascending: false }).limit(15),
  ]);
  const cands = (c ?? []) as { id: string; title: string; summary: string; status: string; reason: string | null; manager_note: string | null; created_at: string }[];
  const byId = new Map(cands.map((x) => [x.id, x]));
  const rules = ((k ?? []) as { id: string; title: string; description: string; created_at: string; learning_candidate_id: string }[]).map((r) => {
    const m = parse(byId.get(r.learning_candidate_id)?.reason ?? null);
    return { id: r.id, title: r.title.replace(/\s*\(검증된 규칙\)$/, ""), rule: r.description, since: r.created_at, counts: m.counts ?? null, lift: m.lift ?? null, p: m.p ?? null, holdout: m.holdout ?? null };
  });
  const recent = cands.map((x) => {
    const m = parse(x.reason);
    return { id: x.id, title: x.title, rule: x.summary, status: x.status, note: (x.manager_note ?? "").split("\n").pop() ?? "", counts: m.counts ?? null, lift: m.lift ?? null, p: m.p ?? null, at: x.created_at };
  });

  const svc = createServiceClient();
  const { data: g } = await svc.from("genesis_runs").select("run_date, status, result").order("run_date", { ascending: false }).limit(7);
  const runs = ((g ?? []) as { run_date: string; status: string; result: Record<string, { evolution?: Record<string, unknown>; rules?: Record<string, unknown> }> & { video?: { ok: boolean; error?: string } } }[]).map((r) => {
    const mine = r.result?.[co.id as string];
    const video = r.result?.video ? (r.result.video.ok ? "정상" : `고장${r.result.video.error ? ` (${r.result.video.error.slice(0, 80)})` : ""}`) : null;
    const rl = mine?.rules as { skipped?: string; adopted?: number; tried?: { title: string; adopt: boolean }[]; rechecked?: { title: string; keep: boolean }[] } | undefined;
    const ev = mine?.evolution as { adopted?: boolean; reason?: string } | undefined;
    const rulersRaw = (mine as { rulers?: { check: string; kind: string }[] } | undefined)?.rulers;
    const rulers = Array.isArray(rulersRaw) && rulersRaw.length
      ? `${rulersRaw.length}개 — ${rulersRaw.slice(0, 2).map((r) => `${r.check}(${r.kind})`).join(", ")}`
      : null;
    return {
      date: r.run_date, status: r.status,
      rules: !rl ? "안 돌았어요" : rl.skipped ? rl.skipped : `시험 ${rl.tried?.length ?? 0}개 · 채택 ${rl.adopted ?? 0}개${rl.rechecked?.length ? ` · 다시 잰 것 ${rl.rechecked.length}개(${rl.rechecked.filter((x) => !x.keep).length}개 내림)` : ""}`,
      prediction: !ev ? "안 돌았어요" : ev.adopted ? "예측 방식이 바뀌었어요" : (ev.reason ?? ""),
      video,
      rulers,
    };
  });
  return Response.json({ rules, recent, runs });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  let body: { knowledgeId?: unknown } = {};
  try { body = await request.json(); } catch { /* 아래에서 거른다 */ }
  const id = typeof body.knowledgeId === "string" ? body.knowledgeId : null;
  if (!id) return Response.json({ error: "knowledgeId 가 필요해요." }, { status: 400 });

  // RLS 가 남의 회사 줄은 안 보여 준다 — 0줄이면 404.
  const { data: row } = await supabase.from("organization_knowledge").select("id, learning_candidate_id, status").eq("id", id).maybeSingle();
  if (!row) return Response.json({ error: "없는 규칙이에요." }, { status: 404 });
  if (row.status !== "active") return Response.json({ ok: true, already: true });
  const { error } = await supabase.from("organization_knowledge").update({ status: "deprecated" }).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (row.learning_candidate_id) {
    const { data: cand } = await supabase.from("learning_candidates").select("manager_note").eq("id", row.learning_candidate_id).maybeSingle();
    await supabase.from("learning_candidates").update({ status: "rejected", manager_note: `${cand?.manager_note ?? ""}\n사장님이 껐어요`.trim(), decided_at: new Date().toISOString() }).eq("id", row.learning_candidate_id);
  }
  return Response.json({ ok: true });
}
