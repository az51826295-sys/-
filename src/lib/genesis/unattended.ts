import type { SupabaseClient } from "@supabase/supabase-js";

type Supabase = SupabaseClient;

/**
 * **무인 판 — 로키는 깃발에 복종만 한다** (200회차 09-20).
 *
 * 사장님: *"로키가 자기 지출을 세는 방식이면, 로키가 죽거나 꼬일 때 문지기도 같이 죽어요. 바깥 프로세스가 상한에 도달하면 강제로 끄게 하세요."*
 *
 * 그래서 나눈다:
 * - **세고 정하는 것**은 바깥(사장님 PC 의 `engine/tools/budget_guard.mts`). 로키가 죽어도 살아 있다.
 * - **로키**는 일을 집기 전에 깃발만 본다. 멈춤 깃발이면 아무것도 안 집는다.
 *
 * 로키가 깃발을 읽는 것은 안전하다 — 로키가 죽어 있으면 애초에 돈을 안 쓰기 때문이다.
 * 막아야 하는 것은 **살아서 돈을 쓰는 로키**이고, 그건 깃발로 막힌다.
 *
 * 판 기록은 `genesis_runs(kind='unattended', run_date=시작일)` 한 행에 담는다(새 표를 안 만든다).
 */

export type UnattendedRun = {
  /** 이 판이 무엇을 시험하나. 첫 판들은 신뢰성만(사장님 제약 3). */
  tests: "신뢰성" | "스스로 잇기";
  startedAt: string;
  /** 계획한 길이(시간). 6 → 48 → 72 순서. */
  hours: number;
  /** **전체** 상한(USD). */
  usdCap: number;
  /** 하루 단위 상한 — 한 번에 다 태우지 못하게(사장님). */
  usdPerDayCap: number;
  /** 같은 실패가 이만큼 연속이면 정지 — 고장에 돈을 태우며 도는 것을 막는다. */
  maxSameFailStreak: number;
  /** 사장님이 봐야 할 산출물 상한. 넘으면 스스로 멈추고 기다린다(사장님 제약 2). */
  humanReviewCap: number;
  /**
   * **진행 없음 감시** (201회차 09-21). 할 일이 있는데 이만큼 아무 진행이 없으면 깃발을 꽂고 판을 끝낸다.
   * 09-20 판이 5시간 58분 동안 아무 일도 안 하고 '성공' 으로 끝난 구멍을 막는 그물.
   * 사장님: *"한 자원이 오래 묶여 있거나 일정 시간 아무 진행이 없으면 깃발을 꽂고 판을 끝내는 장치가 있어야 해요."*
   * **할 일이 없을 때는 안 센다** — 대기열이 빈 것은 고장이 아니다.
   */
  stallMinutes: number;
  /**
   * **72시간 칸(`agent-days`)의 실측인가.** 48시간 이하 판은 **무조건 false** —
   * 나중에 "48시간이면 사실상 열림" 으로 고치면 오늘 막은 사후 기준을 스스로 여는 것이다(사장님 제약 1).
   */
  nodeMeasurement: boolean;
  stopped: boolean;
  stopReason?: string;
  stoppedAt?: string;
  /** 문지기가 본 마지막 값들 — 사람이 읽는 자리. */
  seen?: { at: string; usd: number; usdToday: number; failStreak: number; needHuman: number; /** 202회차: **그물이 본 것도 신호에 얹는다** — 그물이 조용히 죽으면 '아무 일도 안 일어남' 과 구별이 안 된다(사장님). */ hasWork?: boolean; stallMin?: number };
  /**
   * **생존 신호** (사장님 09-20). 문지기가 1분마다 남긴다.
   * *"문지기가 창에 매여 있으면 '바깥' 이 아니에요 — 문지기가 죽으면 로키가 제한 없이 돌아요."*
   * 그래서 **꺼지면 멈추는 쪽**으로 뒤집었다: 로키는 이 신호가 오래됐으면 일을 안 집는다(기본이 거부).
   */
  heartbeat?: string;
  /**
   * **창을 닫은 시각** (203회차 09-21). 판이 멈춘 뒤에도 깃발이 계획한 시간 내내 로키를 막으면,
   * 상한에 1시간 만에 닿은 판이 **사장님의 남은 5시간까지 잠근다**(09-21 에 한 번 당한 그 모양이다).
   * 그래서 문지기는 멈출 때 **남은 무인 대기열을 먼저 치우고**, 치운 것이 확인되면 이 값을 적는다.
   * 적히면 로키는 평소 운영으로 돌아간다 — 치울 것이 남아 있으면 안 적히고, 창은 닫힌 채로 있다(안전 쪽이 기본).
   */
  closedAt?: string;
};

/** 생존 신호가 이만큼 낡으면 로키는 일을 안 집는다. 문지기는 1분마다 남긴다 — 5분이면 확실히 죽은 것. */
export const HEARTBEAT_STALE_MS = 5 * 60_000;

const KIND = "unattended";

export function planFor(hours: number, opts?: Partial<UnattendedRun>): UnattendedRun {
  return {
    tests: "신뢰성",
    startedAt: new Date().toISOString(),
    hours,
    // 하루 $5 · 6시간이면 $1.25 꼴. 우리 14일 지출이 $46 이었으니 무인 판이 그걸 넘지 않게.
    usdCap: Math.max(1, Math.round((hours / 24) * 5 * 100) / 100),
    usdPerDayCap: 5,
    maxSameFailStreak: 3,
    humanReviewCap: 3,
    stallMinutes: 30,
    // 72시간 미만은 칸 실측이 아니다 — 여기서 구조로 막는다.
    nodeMeasurement: hours >= 72,
    stopped: false,
    ...opts,
  };
}

/** 지금 도는 무인 판. 없으면 null. */
export async function activeRun(db: Supabase): Promise<{ id: string; run: UnattendedRun } | null> {
  const { data } = await db.from("genesis_runs").select("id, result").eq("kind", KIND).order("run_date", { ascending: false }).limit(1).maybeSingle();
  const run = (data?.result as UnattendedRun | null) ?? null;
  if (!data || !run?.startedAt) return null;
  const endsAt = new Date(new Date(run.startedAt).getTime() + run.hours * 3600_000);
  if (Date.now() > endsAt.getTime() && !run.stopped) return { id: data.id as string, run };
  if (Date.now() > endsAt.getTime() + 86400_000) return null; // 하루 넘게 지난 판은 끝난 것
  return { id: data.id as string, run };
}

/**
 * **로키가 일을 집기 전에 보는 깃발.** 멈춤이면 이유를 돌려준다. 무인 판이 없으면 통과(평소 운영).
 * 로키는 여기서 세지 않는다 — 세는 것은 바깥 문지기다.
 */
export async function blockedByUnattended(db: Supabase): Promise<string | null> {
  try {
    const a = await activeRun(db);
    if (!a) return null;
    // **판의 창 안에서만 막는다** (201회차 09-21 버그). 전에는 멈춘 판이 24시간 동안 계속 막아서,
    // 09-20 판이 02:02 에 끝난 뒤 로키가 **사장님 일까지** 못 집고 있었다(대기 중 실행 1개가 영영 대기).
    // 깃발의 목적은 "도는 동안 문지기 말을 듣는 것" 이지 "끝난 뒤에도 잠그는 것" 이 아니다.
    const endsAt = new Date(a.run.startedAt).getTime() + a.run.hours * 3600_000;
    if (Date.now() > endsAt) return null; // 판이 끝났다 — 평소 운영으로 돌아간다
    // 문지기가 남은 대기열을 치우고 창을 닫았다 → 더 막을 이유가 없다(무인 일이 안 남아 있다).
    if (a.run.closedAt) return null;
    if (a.run.stopped) return `무인 판이 멈춤: ${a.run.stopReason ?? "이유 없음"}`;
    // **꺼지면 멈춘다.** 신호가 없거나 낡았으면 문지기가 죽은 것이다 — 그때 로키가 계속 도는 것이 제일 위험하다.
    const beat = a.run.heartbeat ? Date.parse(a.run.heartbeat) : 0;
    const age = Date.now() - beat;
    if (!beat || age > HEARTBEAT_STALE_MS) return `문지기의 생존 신호가 ${beat ? `${Math.round(age / 60000)}분째 없다` : "아예 없다"} — 지키는 사람이 없으면 일하지 않는다`;
    return null;
  } catch { return null; } // 깃발을 못 읽으면 평소대로 — 문지기가 바깥에서 또 본다
}

/** 판을 연다. 같은 날 두 판은 못 연다(genesis_runs unique). */
export async function startRun(db: Supabase, run: UnattendedRun): Promise<{ ok: true; id: string } | { ok: false; why: string }> {
  const day = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  // 첫 신호를 같이 남긴다 — 안 그러면 문지기가 첫 바퀴를 돌기 전까지 로키가 막혀 있다.
  const { data, error } = await db.from("genesis_runs").insert({ kind: KIND, run_date: day, status: "running", result: { ...run, heartbeat: new Date().toISOString() } }).select("id").single();
  if (error || !data) return { ok: false, why: error?.message ?? "못 열었다" };
  return { ok: true, id: data.id as string };
}

/**
 * 문지기가 멈춘다. 로키는 다음에 일을 집을 때 이 깃발을 본다.
 * `closeWindow` 는 **남은 무인 대기열을 치운 것이 확인됐을 때만** 참이어야 한다 — 남겨 둔 채 창을 열면
 * 로키가 그 일을 계속 집어 상한을 넘긴다. 판단은 문지기(`budget_guard.mts`)가 하고, 여기선 적기만 한다.
 */
export async function stopRun(db: Supabase, id: string, run: UnattendedRun, reason: string, closeWindow = false): Promise<void> {
  await db.from("genesis_runs").update({
    status: "done", finished_at: new Date().toISOString(),
    result: { ...run, stopped: true, stopReason: reason, stoppedAt: new Date().toISOString(), ...(closeWindow ? { closedAt: new Date().toISOString() } : {}) },
  }).eq("id", id);
}

/**
 * **남은 무인 대기열을 치운다.** 판이 멈추면 그 판의 일도 끝이다 — 안 치우면 창을 열 수 없고,
 * 창을 못 열면 사장님이 학교에서 돌아와도 로키가 안 움직인다.
 * 돌고 있는 것은 **건드리지 않는다**(실험을 끄지 않는다 — 09-21 상시 규칙). 안 시작한 것만 치운다.
 * 돌려주는 값: `{ cancelled, left }`. `left === 0` 일 때만 창을 열어도 안전하다.
 */
export async function clearUnattendedQueue(db: Supabase): Promise<{ cancelled: number; left: number }> {
  const { data: done } = await db.from("assignments").update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("role_input_json->>unattended", "true").eq("status", "waiting").select("id");
  const { count: left } = await db.from("assignments").select("id", { count: "exact", head: true })
    .eq("role_input_json->>unattended", "true").eq("status", "waiting");
  return { cancelled: done?.length ?? 0, left: left ?? 0 };
}

/** 문지기가 본 것 + **생존 신호**를 적는다(멈추진 않는다). 이걸 못 적으면 5분 뒤 로키가 스스로 멈춘다. */
export async function noteSeen(db: Supabase, id: string, run: UnattendedRun, seen: NonNullable<UnattendedRun["seen"]>): Promise<void> {
  await db.from("genesis_runs").update({ result: { ...run, seen, heartbeat: new Date().toISOString() } }).eq("id", id);
}
