import type { SupabaseClient } from "@supabase/supabase-js";
import { trialLine, type SeatTrial } from "@/lib/genesis/seatBench";
import { seatRecords, fixCandidates, recordLine, headWins } from "@/lib/skills/appBuild/seats";

type Supabase = SupabaseClient;

/**
 * **주말 한 장 보고 — AI 세 줄** (190회차 09-19, 2단계 3번의 마지막 조각).
 * 계획서: "새 모델이 나온 주에, 사장님이 말하지 않아도 보고에 그 모델의 우리 시험판 성적이 올라와 있다."
 *
 * 토요일 아침 한 번(한 주 한 번은 genesis_runs(kind=weekly, run_date=그 주 월요일) unique 가 지킨다), 지난 7일의 매일 실행에서
 * 새로 생긴 AI · 없어질 AI · 시험한 것(seatBench) · 자리 성적표를 모아 사장님의 마지막 대화에 한 턴으로 붙인다.
 * 모델 이름은 여기서만 나온다 — 이 보고는 "어떤 AI 를 쓰는가" 를 묻는 자리라서(계획 카드의 규칙과 다르다).
 */
export async function weeklyLines(db: Supabase, days = 7): Promise<{ lines: string[]; fresh: string[]; gone: string[]; trials: SeatTrial[] }> {
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const { data: runs } = await db.from("genesis_runs").select("run_date, result").eq("kind", "daily").gte("run_date", since).order("run_date");
  const fresh = new Map<string, string>(), gone = new Map<string, string>(), missing = new Set<string>();
  const trials: SeatTrial[] = [];
  for (const r of runs ?? []) {
    const m = (r.result as { models?: { report?: { fresh?: { id: string }[]; gone?: { id: string }[]; missingInUse?: string[] }; trials?: SeatTrial[] } } | null)?.models;
    for (const f of m?.report?.fresh ?? []) fresh.set(f.id, r.run_date as string);
    for (const g of m?.report?.gone ?? []) gone.set(g.id, r.run_date as string);
    for (const x of m?.report?.missingInUse ?? []) missing.add(x);
    for (const t of m?.trials ?? []) trials.push(t);
  }
  // 지난 날들의 기록이 헛경보였을 수 있다(별칭) — 마지막 스냅샷에 같은 가족이 남아 있으면 없어진 게 아니다.
  try {
    const { family } = await import("@/lib/providers/modelWatch");
    const last = [...(runs ?? [])].reverse().map((r) => (r.result as { models?: { snapshot?: { models?: { id: string }[] } } } | null)?.models?.snapshot?.models).find((x) => Array.isArray(x));
    if (last) {
      const fams = new Set(last.map((m) => family(m.id)));
      for (const id of [...gone.keys()]) if (fams.has(family(id))) gone.delete(id);
      for (const id of [...missing]) if (fams.has(family(id))) missing.delete(id);
    }
  } catch { /* 감시 모듈이 없으면 그대로 */ }
  const lines: string[] = [];
  lines.push(fresh.size ? `이번 주 새로 나온 AI ${fresh.size}개: ${[...fresh.keys()].slice(0, 8).join(", ")}${fresh.size > 8 ? " …" : ""}` : "이번 주 새로 나온 AI: 없음");
  if (gone.size || missing.size) lines.push(`없어진 것: ${[...gone.keys(), ...missing].slice(0, 6).join(", ")}${missing.size ? " (우리가 쓰는 것 포함 — 확인 필요)" : ""}`);
  lines.push(trials.length ? `시험한 것(고장 셋 고치기·그림 보기): ${trials.map(trialLine).join(" / ")}` : "시험한 것: 없음 (새 모델이 없었거나 단가를 몰라 못 불렀음)");
  try {
    const rec = await seatRecords(db, fixCandidates(), days);
    const best = [...rec].sort((a, b) => b.score - a.score || a.usd - b.usd)[0];
    lines.push(`고치는 자리 성적표(${days}일): ${rec.map(recordLine).join(" / ")}` + (best && best.n >= 5 ? ` → 지금 제일 좋은 자리: ${best.model}` : " → 아직 채우는 중(5판까지)"));
  } catch { /* 성적표 없으면 그 줄은 뺀다 */ }
  // 192회차(2단계 끝 조건): 머리가 고른 쪽이 더 자주 이겼나.
  try { lines.push((await headWins(db, days)).line); } catch { /* 없으면 뺀다 */ }
  // 193회차(제네시스 본령): 기술 나무 — 지금 열릴 준비가 된 칸과 잠긴 예측의 성적.
  try {
    const { loadTree, ready, loadLocked, grade } = await import("@/lib/genesis/techTree");
    const tree = loadTree();
    const r = ready(tree).filter((x) => !x.missing.length);
    const g = grade(tree, loadLocked());
    const tot = g.reduce((a, x) => ({ hit: a.hit + x.hit, miss: a.miss + x.miss, pending: a.pending + x.pending }), { hit: 0, miss: 0, pending: 0 });
    lines.push(`기술 나무: 열릴 준비가 된 칸 ${r.length}개(${r.map((x) => x.node.name).slice(0, 3).join(", ")}${r.length > 3 ? " …" : ""}) · 잠긴 예측 맞음 ${tot.hit}·틀림 ${tot.miss}·아직 ${tot.pending}`);
  } catch { /* 나무를 못 읽으면 뺀다 */ }
  return { lines, fresh: [...fresh.keys()], gone: [...gone.keys()], trials };
}

/** 이번 주 월요일(KST) 날짜 — 한 주 한 번의 열쇠. */
export function weekKey(now = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const day = kst.getUTCDay(); // 0=일
  const monday = new Date(kst.getTime() - ((day + 6) % 7) * 86400_000);
  return monday.toISOString().slice(0, 10);
}

/**
 * 토요일 09~12시(KST)에 한 번. 사장님(회사 주인)의 가장 최근 대화에 붙인다. 붙였으면 true.
 */
export async function postWeekly(db: Supabase, log: (m: string) => void, opts?: { force?: boolean; companyId?: string }): Promise<boolean> {
  const kst = new Date(Date.now() + 9 * 3600_000);
  if (!opts?.force && !(kst.getUTCDay() === 6 && kst.getUTCHours() >= 9 && kst.getUTCHours() < 12)) return false;
  const key = weekKey();
  const { data: claimed, error } = await db.from("genesis_runs").insert({ kind: "weekly", run_date: key }).select("id").single();
  if (error || !claimed) { if (!opts?.force) return false; }
  const { lines } = await weeklyLines(db);
  const { data: co } = opts?.companyId
    ? await db.from("companies").select("id, owner_id").eq("id", opts.companyId).maybeSingle()
    : await db.from("companies").select("id, owner_id").order("created_at").limit(1).maybeSingle();
  if (!co) return false;
  const { data: conv } = await db.from("conversations").select("id").eq("owner_id", co.owner_id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!conv) return false;
  const content = `**이번 주 AI 보고** (${key} 주)\n\n${lines.map((l) => `- ${l}`).join("\n")}\n\n갈아타기는 자동으로 하지 않아요 — 시험 성적이 지금 자리보다 좋고 값이 싸면 여기에 "갈아탈까요?" 라고 물을게요.`;
  const { error: e2 } = await db.from("conversation_messages").insert({ conversation_id: conv.id, role: "assistant", content, attachments: { weekly: key } });
  if (e2) { log(`주간 보고 못 붙임: ${e2.message}`); return false; }
  if (claimed) await db.from("genesis_runs").update({ finished_at: new Date().toISOString(), status: "done", result: { lines } }).eq("id", claimed.id);
  log(`주간 보고 붙임(${key} 주) → 대화 ${String(conv.id).slice(0, 8)}`);
  return true;
}
