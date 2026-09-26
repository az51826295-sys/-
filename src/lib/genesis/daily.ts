import type { Supabase } from "@/lib/execution/shared";
import type { AIProvider } from "@/lib/providers/types";
import { runEvolution } from "./evolve";
import { runRuleLoop } from "./ruleLoop";

/**
 * 자가진화 하루 한 번 (100회차 09-14, 사장님 "2,3"의 2).
 *
 * 전에는 진화가 손으로만 돌았다(`engine/tools/genesis_evolve.mts`) — 아무도 안 돌리면 영원히 안 돈다.
 * 이제 로키 워커가 한 시간마다 들여다보고, 한국 시각 새벽 4시 이후 **그날 첫 번째로** 여기를 부른다.
 * 하루 한 번은 `genesis_runs(kind, run_date)` unique 로 지킨다 — 워커가 둘이거나 재시작돼도 먼저 넣은 쪽만 돈다.
 *
 * 회사마다: (1) 예측 진화 — 판정 40건 미만이면 스스로 "아직 이르다" 하고 끝남(돈 0),
 *           (2) 검증된 규칙 고리 — 지출 승인 없으면 스스로 건너뜀.
 * 결과 요약은 그날 줄의 result 에 남는다(무엇이 왜 안 됐는지까지).
 */
/** 오늘 몫이 실패했을 때 다시 해 보는 횟수. 한 번이면 충분하다 — 두 번째도 실패하면 고장이지 흔들림이 아니다. */
export const MAX_DAILY_RETRIES = 1;

export function kstDate(now: Date): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

export async function runDaily(
  db: Supabase,
  ai: AIProvider,
  log: (m: string) => void,
  now: Date = new Date(),
): Promise<{ ran: boolean; date: string; reason?: string; result?: Record<string, unknown> }> {
  const date = kstDate(now);
  const { data: inserted, error } = await db.from("genesis_runs").insert({ kind: "daily", run_date: date }).select("id").single();
  let claimed = inserted;
  if (error) {
    if (error.code !== "23505") {
      log(`자리 잡기 실패: ${error.message}`);
      return { ran: false, date, reason: error.message };
    }
    // 118회차 09-15: 오늘 몫이 **실패로 끝나 있으면** 다음 시간에 한 번 더 한다. 전에는 실패한 채 내일까지 그대로였고,
    // 그래서 오늘 고친 것이 맞는지 하루를 기다려야 했다(117회차의 '기계적인 고장은 한 번 다시' 와 같은 생각).
    // 돌고 있는 중(running)이거나 이미 끝난 것(done)은 건드리지 않는다.
    const { data: row } = await db.from("genesis_runs").select("id, status, result").eq("kind", "daily").eq("run_date", date).maybeSingle();
    const tries = Number((row?.result as { retries?: number } | null)?.retries ?? 0);
    if (!row || row.status !== "failed" || tries >= MAX_DAILY_RETRIES) {
      return { ran: false, date, reason: row?.status === "failed" ? `오늘 실패했고 다시 ${tries}번 했다(최대 ${MAX_DAILY_RETRIES})` : "오늘 이미 돌았다" };
    }
    const { data: retaken } = await db
      .from("genesis_runs")
      .update({ status: "running", finished_at: null, result: { retries: tries + 1 } })
      .eq("id", row.id)
      .eq("status", "failed") // 자리 잡기: 둘이 동시에 집으면 하나만 성공한다
      .select("id")
      .maybeSingle();
    if (!retaken) return { ran: false, date, reason: "다른 워커가 다시 하는 중" };
    log(`오늘 실패한 몫을 다시 한다 (${tries + 1}/${MAX_DAILY_RETRIES})`);
    claimed = retaken;
  }
  if (!claimed) return { ran: false, date, reason: "자리를 못 잡았다" };

  // 다시 한 횟수는 끝까지 들고 간다 — 아래에서 result 를 통째로 덮어쓰기 때문에, 안 실으면 다음 실패 때 0부터 세어
  // **한 시간마다 영원히 다시 하게 된다.**
  const { data: mine } = await db.from("genesis_runs").select("result").eq("id", claimed.id).maybeSingle();
  const retries = Number((mine?.result as { retries?: number } | null)?.retries ?? 0);
  const result: Record<string, unknown> = retries ? { retries } : {};
  let failed = false;
  const { data: companies } = await db.from("companies").select("id, name, owner_id");
  // 113회차: 시험판·자(seed) 계정의 회사(@rookery.local)는 배우는 대상이 아니다 — 09-15 첫 자동 실행이 시험판 회사의 자 고장(프로필 없음) 8건을
  // '실패 사례' 로 세었다. 주인 이메일로 거른다.
  const testOwners = new Set<string>();
  try { const { data: users } = await db.auth.admin.listUsers({ perPage: 500 }); for (const u of users.users) if ((u.email ?? "").endsWith("@rookery.local")) testOwners.add(u.id); } catch { /* 못 읽으면 안 거른다 */ }
  for (const co of (companies ?? []) as { id: string; name: string | null; owner_id: string }[]) {
    if (testOwners.has(co.owner_id)) { log(`${(co.name ?? co.id).slice(0, 20)} · 시험용 회사라 건너뜀`); continue; }
    const entry: Record<string, unknown> = {};
    try {
      const ev = await runEvolution(db, co.id);
      entry.evolution = ev.adopted
        ? { adopted: true, gene: ev.gene, from: ev.from, to: ev.to, brier: [ev.baseBrier, ev.newBrier], holdout: ev.holdout, source: ev.source }
        : { adopted: false, reason: ev.reason, source: ev.source };
    } catch (e) {
      failed = true;
      entry.evolution = { error: e instanceof Error ? e.message : String(e) };
    }
    try {
      const rl = await runRuleLoop(db, ai, co.id);
      entry.rules = rl.skipped
        ? { skipped: rl.skipped, cases: rl.cases }
        : { adopted: rl.adopted, tried: rl.trials.map((t) => ({ title: t.title, adopt: t.adopt, reason: t.reason })), rechecked: rl.rechecks.map((r) => ({ title: r.title, keep: r.keep, reason: r.reason })), calls: rl.calls, cases: rl.cases };
    } catch (e) {
      failed = true;
      entry.rules = { error: e instanceof Error ? e.message : String(e) };
    }
    // 124회차: **자를 의심한다.** 규칙 고리는 직원 행동만 제안할 수 있어서 자가 틀렸을 때는 오히려 틀린 자를 맞히려 배운다.
    // 값의 분포로 수상한 자를 표시만 한다 — 고치지는 않는다(자를 스스로 느슨하게 하면 그건 자가 아니다).
    try {
      const { collectRulerStats, auditRulers } = await import("./rulerAudit");
      const flags = auditRulers(await collectRulerStats(db, co.id));
      if (flags.length) {
        entry.rulers = flags.slice(0, 8).map((f) => ({ check: f.check, kind: f.kind, why: f.why }));
        log(`${(co.name ?? "").slice(0, 12)} · 수상한 자 ${flags.length}개: ${flags.slice(0, 3).map((f) => `${f.check}(${f.kind})`).join(", ")}`);
      }
    } catch (e) {
      entry.rulers = { error: e instanceof Error ? e.message : String(e) };
    }
    // 169회차: **행동에서 판정 읽기.** 결과를 받고 사장님이 한 말을 싼 모델로 읽어 그 말에 붙여 둔다(읽은 말은 다시 안 읽는다).
    // 승인 단추가 0건이어도 사람 판정이 쌓인다 — 계기판·예측기는 붙여 둔 것만 읽는다(모델 0).
    try {
      const { loadImplicit } = await import("./implicit");
      const im = await loadImplicit(db, co.id, ai);
      entry.implicit = { returned: im.returned, withReply: im.withReply, read: im.read, verdicts: im.verdicts.length, approved: im.verdicts.filter((v) => v.approved === 1).length };
    } catch (e) {
      entry.implicit = { error: e instanceof Error ? e.message : String(e) };
    }
    // 168회차: **맥박.** 최초 계획(Existence Drive)의 계기판을 매일 읽어 그날 줄에 남긴다 — 모델 없음, 돈 0.
    // 이게 없어서 "진화가 도는가 굶는가" 를 50일 동안 사람이 손으로 셌고, 그동안 예측은 0.700 상수였다.
    try {
      const { loadVitals } = await import("./vitals");
      const v = await loadVitals(db, co.id);
      entry.vitals = {
        alive: v.alive.verdict, why: v.alive.why, committed: v.committed, scored: v.scored, grounding: v.grounding, bySource: v.bySource, brier: v.brier, distinctP: v.distinctP,
        domains: v.domains.filter((d) => d.lp).map((d) => ({ skill: d.skill, lp: d.lp!.delta, perUsd: d.lp!.perUsd, state: d.lp!.state, second: d.secondEncounter?.delta ?? null })),
        hypotheses: v.hypotheses,
      };
      log(`${(co.name ?? "").slice(0, 12)} · 맥박: ${v.alive.verdict} — ${v.alive.why.slice(0, 100)}`);
    } catch (e) {
      entry.vitals = { error: e instanceof Error ? e.message : String(e) };
    }
    result[co.id] = entry;
    log(`${(co.name ?? co.id).slice(0, 20)} · 진화 ${JSON.stringify(entry.evolution).slice(0, 120)} · 규칙 ${JSON.stringify(entry.rules).slice(0, 160)}`);
  }

  // 112회차: 영상 배관 자가 점검(모델 없음). 111회차 시험판이 일주일 넘게 죽어 있던 영상을 잡았다 — 매일 스스로 재고 '배운 것' 창에 보인다.
  try {
    const { videoSelfcheck } = await import("@/lib/video/selfcheck");
    const v = await videoSelfcheck();
    result.video = v;
    log(`영상 배관 ${v.ok ? "정상" : "고장"} · ${v.ffmpeg} · ${v.ms}ms${v.error ? ` · ${v.error}` : ""}`);
  } catch (e) {
    result.video = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  // 171회차(2단계 첫 조각): **지금 어떤 AI 들이 있는가.** 공급자의 모델 목록을 읽어 어제 장부와 견준다 — 돈 0, 모델 0.
  // 첫 판독(09-18)이 찾은 것: 로키의 주력 `gpt-5` 는 2025-08 모델이고 그 뒤로 5.1~5.6 과 코드 전용 판이 나와 있었다. 아무도 몰랐다.
  // 여기선 파악만 한다. 갈아타는 것은 시험판에 대 본 뒤다(소문이 아니라 우리 일에서 나은지).
  try {
    const { watchModels } = await import("@/lib/providers/modelWatch");
    const { data: last } = await db.from("genesis_runs").select("result").eq("kind", "daily").not("result->models", "is", null).order("run_date", { ascending: false }).limit(1).maybeSingle();
    const prev = ((last?.result as { models?: { snapshot?: unknown } } | null)?.models?.snapshot ?? null) as Parameters<typeof watchModels>[0];
    const { report, snapshot } = await watchModels(prev);
    // 190회차(2단계 3번): 새로 생긴 글 모델은 **그날 바로 자리 시험판에 댄다**(모델당 ≈$0.01·30초, 하루 3개까지). 단가 없는 건 "단가 필요" 로 남는다.
    const trials: import("@/lib/genesis/seatBench").SeatTrial[] = [];
    try {
      const { runSeatBench, trialLine } = await import("@/lib/genesis/seatBench");
      const textish = report.fresh.filter((m) => (m.vendor === "openai" || m.vendor === "deepseek") && !/image|sora|video|gpt-image|chatgpt|chat-latest|-pro$|codex-mini|nano/i.test(m.id)).slice(0, 3);
      for (const m of textish) { const t = await runSeatBench(m.id); trials.push(t); log(`새 모델 시험: ${trialLine(t)}`); }
    } catch (e) { log(`새 모델 시험 실패: ${e instanceof Error ? e.message : String(e)}`); }
    // 226회차 09-26 — **가지고 있는데 안 쓰는 힘.** 위의 파악은 "새로 생겼나·없어졌나" 를 본다. 그런데
    // 오늘 손으로 찾아보니 **처음부터 안 쓰던 것**이 있었다: 한 열쇠로 61개가 열리는데 우리는 영상 셋만 불렀고,
    // 음악(Lyria)은 통째로 비어 있었다 — 광고에 음악이 없던 이유다. 새것도 아니고 없어진 것도 아니라
    // 어느 검사에도 안 걸렸다. 매일 같이 센다(돈 0, 목록은 위에서 이미 읽었다).
    let idle: ReturnType<typeof import("@/lib/providers/modelWatch").idlePower> | null = null;
    try {
      const { idlePower, IN_USE } = await import("@/lib/providers/modelWatch");
      idle = idlePower(snapshot.models, IN_USE);
      const empty = Object.entries(idle.unusedPowers);
      if (empty.length) log(`**통째로 안 쓰는 힘**: ${empty.map(([k, v]) => `${k}(${v.length})`).join(" · ")}`);
      const spare = Object.entries(idle.untried).filter(([k]) => k !== "text");
      if (spare.length) log(`안 대 본 후보: ${spare.map(([k, v]) => `${k} ${v.length}`).join(" · ")}`);
    } catch (e) { log(`안 쓰는 힘 세기 실패: ${e instanceof Error ? e.message : String(e)}`); }

    result.models = { report, snapshot, trials, idle };
    // 195회차 (ㄴ) 트랙: 본 것을 **배달한다.** gpt-live-1 은 09-08 에 목록에 떴는데(공표 09-10) 아무도 안 봤다 — 눈이 아니라 알림이 없었다.
    try {
      const { buildAlerts, postUrgent } = await import("@/lib/genesis/eye");
      const alerts = buildAlerts(report);
      result.eye = alerts;
      const posted = await postUrgent(db, alerts, log);
      log(`눈: 알림 ${alerts.length}건(급한 것 ${alerts.filter((a) => a.urgent).length}건, 붙임 ${posted})`);
    } catch (e) { log(`눈 실패: ${e instanceof Error ? e.message : String(e)}`); }
    log(`AI 목록: ${Object.entries(report.vendors).map(([v, s]) => `${v} ${s.ok ? s.count : "못 읽음"}`).join(" · ")} · 새로 생김 ${report.fresh.length}${report.fresh.length ? `(${report.fresh.slice(0, 5).map((m) => m.id).join(", ")})` : ""} · 부르는데 없는 것 ${report.missingInUse.length}`);
  } catch (e) {
    result.models = { error: e instanceof Error ? e.message : String(e) };
  }

  await db.from("genesis_runs").update({ finished_at: new Date().toISOString(), status: failed ? "failed" : "done", result }).eq("id", claimed.id);
  return { ran: true, date, result };
}
