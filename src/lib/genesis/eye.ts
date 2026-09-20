import type { SupabaseClient } from "@supabase/supabase-js";
import { isPriced } from "@/lib/costs/pricing";

type Supabase = SupabaseClient;

/**
 * **눈 트랙 — 먼저 줍는다** (195회차 09-20).
 *
 * 사장님이 가른 두 트랙 중 (ㄴ). *"먼저 줍는다는 나무 문제가 아니라 **눈 문제**예요. 놓친 5개는 예측이 틀려서가 아니라 관측이 못 봐서 놓친 거죠."*
 *
 * 그리고 실제로 그랬다: `gpt-live-1`(동시에 듣고 말하는 음성, 분당 $0.05)이 **2026-09-08 우리 감시 목록에 떴다.**
 * 공표는 09-10. **우리 눈은 이틀 빨랐는데 보는 사람이 없었다.** 눈이 나쁜 게 아니라 **알림이 없었던** 것이다.
 *
 * 그래서 여기가 하는 일은 판단이 아니라 배달이다:
 * - **즉시**: 우리가 쓰는 것이 없어질 때(sora-2 폐기 같은 것), 잠긴 열림 조건에 걸릴 만한 것이 나타날 때
 * - **주간**: 새 모델, 단가 미상(단가가 없으면 시험도 못 한다 — 190회차)
 *
 * **오경보율이 이 트랙의 성적표다**(사장님). 알림마다 "쓸모있었나" 를 한 줄 남기고, 그 비율을 주간에 낸다.
 * 알림이 많고 쓸모없으면 눈이 시끄러운 것이고, 그건 눈을 끄는 게 아니라 **거르는 선을 고치라는 신호**다.
 */

export type Alert = {
  id: string;
  at: string;
  kind: "gone-in-use" | "condition-candidate" | "new-model" | "no-price";
  urgent: boolean;
  title: string;
  detail: string;
  /** 사장님 판정 — null 이면 아직 안 봄. 이게 이 트랙의 성적이다. */
  useful: boolean | null;
  note?: string;
};

/** 잠긴 열림 조건에 걸릴 만한 새 모델인가 — 판정이 아니라 **사람이 확인하라는 신호**다. */
const CONDITION_HOOKS: { match: RegExp; nodeId: string; why: string }[] = [
  { match: /veo|sora|video|kling|seedance|runway/i, nodeId: "cheap-video", why: "영상 모델 — 잠긴 품질 선(video-q1)과 B3 값 점을 확인해야 한다" },
  { match: /image/i, nodeId: "img-edit-keep", why: "그림 모델 — 정밀 편집 칸" },
  { match: /live|realtime|duplex/i, nodeId: "full-duplex-voice", why: "음성 층 — 이미 열린 칸이지만 값이 바뀔 수 있다" },
];

type WatchReport = { fresh: { id: string; vendor: string }[]; gone: { id: string }[]; missingInUse: string[] };

export function buildAlerts(report: WatchReport, at = new Date().toISOString()): Alert[] {
  const out: Alert[] = [];
  const day = at.slice(0, 10);
  let n = 0;
  const mk = (a: Omit<Alert, "id" | "at" | "useful">): Alert => ({ ...a, id: `${day.replace(/-/g, "")}-${++n}`, at, useful: null });

  // 1) 우리가 쓰는 것이 없어졌다 — 제일 급하다. sora-2 폐기를 우리는 시장조사를 하다 우연히 알았다(181회차).
  for (const id of report.missingInUse) {
    out.push(mk({ kind: "gone-in-use", urgent: true, title: `쓰고 있는 모델이 목록에서 사라졌어요 — ${id}`, detail: "폐기 예고일 수 있어요. 대체를 찾아야 그날 멈추지 않아요." }));
  }
  // 2) 잠긴 조건에 걸릴 만한 새 모델 — 확인하라는 신호
  for (const m of report.fresh) {
    const hook = CONDITION_HOOKS.find((h) => h.match.test(m.id));
    if (hook) out.push(mk({ kind: "condition-candidate", urgent: true, title: `${hook.nodeId} 확인 — 새 모델 ${m.id}`, detail: hook.why }));
  }
  // 3) 나머지 새 모델 + 단가 미상 — 주간으로 모은다
  for (const m of report.fresh) {
    if (CONDITION_HOOKS.some((h) => h.match.test(m.id))) continue;
    out.push(mk({ kind: "new-model", urgent: false, title: `새 모델 ${m.id} (${m.vendor})`, detail: "" }));
    if (!isPriced(m.id)) out.push(mk({ kind: "no-price", urgent: false, title: `단가 미상 — ${m.id}`, detail: "costs/pricing.ts 에 값을 적어야 시험판에 댈 수 있어요(190회차)." }));
  }
  return out;
}

/** 급한 것만 사장님 대화에 바로. 나머지는 주간이 가져간다. 붙인 개수를 돌려준다. */
export async function postUrgent(db: Supabase, alerts: Alert[], log: (m: string) => void): Promise<number> {
  const urgent = alerts.filter((a) => a.urgent);
  if (!urgent.length) return 0;
  const { data: co } = await db.from("companies").select("id, owner_id").order("created_at").limit(1).maybeSingle();
  if (!co) return 0;
  const { data: conv } = await db.from("conversations").select("id").eq("owner_id", co.owner_id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!conv) return 0;
  const content =
    `**눈 — 지금 봐야 할 것 ${urgent.length}가지**\n\n` +
    urgent.map((a) => `- **${a.title}**${a.detail ? `\n  ${a.detail}` : ""}`).join("\n") +
    `\n\n쓸모없었으면 "쓸모없었어" 라고만 해 주세요 — 그걸로 눈이 시끄러운지 잽니다.`;
  const { error } = await db.from("conversation_messages").insert({ conversation_id: conv.id, role: "assistant", content, attachments: { eye: urgent.map((a) => a.id) } });
  if (error) { log(`눈 알림 못 붙임: ${error.message}`); return 0; }
  log(`눈 알림 ${urgent.length}건 붙임 → 대화 ${String(conv.id).slice(0, 8)}`);
  return urgent.length;
}

/** 지난 날들의 알림을 모은다(매일 실행의 result.eye 에 쌓인다). */
export async function recentAlerts(db: Supabase, days = 7): Promise<Alert[]> {
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const { data } = await db.from("genesis_runs").select("run_date, result").eq("kind", "daily").gte("run_date", since).order("run_date");
  const out: Alert[] = [];
  for (const r of data ?? []) for (const a of ((r.result as { eye?: Alert[] } | null)?.eye ?? [])) out.push(a);
  return out;
}

/** **(ㄴ) 트랙의 성적표** — 판정된 알림 중 쓸모없었던 비율. 판정이 없으면 셀 수 없다고 말한다. */
export function falseAlarmLine(alerts: Alert[]): string {
  const judged = alerts.filter((a) => a.useful !== null);
  const bad = judged.filter((a) => a.useful === false).length;
  const unjudged = alerts.length - judged.length;
  if (!alerts.length) return "눈 알림: 없음";
  if (!judged.length) return `눈 알림 ${alerts.length}건 · 판정 0건 — **오경보율을 못 센다**(쓸모있었는지 한 줄이 필요해요)`;
  return `눈 알림 ${alerts.length}건 · 오경보 ${bad}/${judged.length} (${Math.round((bad / judged.length) * 100)}%)` + (unjudged ? ` · 미판정 ${unjudged}건` : "");
}

/** 판정을 적는다 — 그 알림이 든 날의 매일 실행 행을 고친다. */
export async function judgeAlert(db: Supabase, alertId: string, useful: boolean, note?: string): Promise<boolean> {
  const day = `${alertId.slice(0, 4)}-${alertId.slice(4, 6)}-${alertId.slice(6, 8)}`;
  const { data: row } = await db.from("genesis_runs").select("id, result").eq("kind", "daily").eq("run_date", day).maybeSingle();
  if (!row) return false;
  const result = (row.result as { eye?: Alert[] } | null) ?? {};
  const list = result.eye ?? [];
  const hit = list.find((a) => a.id === alertId);
  if (!hit) return false;
  hit.useful = useful;
  if (note) hit.note = note;
  const { error } = await db.from("genesis_runs").update({ result: { ...result, eye: list } }).eq("id", row.id);
  return !error;
}
