"use client";

import { useEffect, useState } from "react";

import { ApproveGate } from "./ApproveGate";

/**
 * 유니티 일이 도는 동안 **보이는 것**.
 *
 * 지금까지 대화창은 "설계했습니다, 심부름꾼이 집어 갑니다" 까지 말하고 조용해졌다.
 * 그 뒤로 십 분이 지나가는데 화면에는 아무 일도 안 일어난다 — 사람은 되고 있는지
 * 죽었는지 모른 채 기다리고, 대개 터미널을 열어서 확인한다. 창구가 두 개면
 * 그건 협업이 아니다.
 *
 * **말풍선이 아니라 띠다.** 대화는 브라우저(localStorage)에 살고 유니티 세션은
 * 서버에 산다. 세션을 말풍선 안에 넣으면 새로고침 한 번에 반쪽만 남는다.
 * 세션은 회사의 것이지 이 대화의 것이 아니므로, 어느 대화를 보고 있든 같은 자리에
 * 붙는다.
 *
 * **초록불을 지어내지 않는다.** 사장님 시안에는 `Unity 6 Connected` 초록 알약이
 * 있었지만, 우리는 연결을 잰 적이 없다. 잰 것은 심부름꾼이 마지막으로 일을
 * 물으러 온 시각뿐이라 화면에도 그것만 적는다 — `Unity 6 · 8초 전`. 재지 않은
 * 것을 "연결됨" 이라고 쓰면, 이 고리가 여섯 번 밟은 그 병이 화면으로 옮겨 온다:
 * **못 본 것과 없는 것을 같게 읽으면, 못 볼수록 잘 통과한다.**
 */

type Round = {
  round: number;
  files: number;
  errors: { file: string; line: number; message: string }[];
  note: string | null;
  at: string;
};

export type Live = {
  runnerSeenAt: string | null;
  runnerMeasurable: boolean;
  session: {
    id: string;
    want: string;
    scope: string;
    status: string;
    round: number;
    endedWhy: string | null;
    sceneMethod: string | null;
    criteriaCount: number;
    /** 사람이 켜 보고 무엇이라 했는가. null 이면 **아직 안 봤다**. */
    humanVerdict: "approved" | "rejected" | null;
    humanNote: string | null;
    humanAt: string | null;
    planned: number;
    written: number;
    /** 설계도가 적은 그림 수와, 그중 만든 수. */
    sprites: number;
    drawn: number;
    startedAt: string;
    updatedAt: string;
    rounds: Round[];
  } | null;
};

/** 도는 동안은 자주, 끝났으면 드물게. 안 보는 탭에서는 아예 안 묻는다. */
const POLL_RUNNING = 5000;
const POLL_IDLE = 30000;

/**
 * 띠도 같은 글씨를 쓴다.
 *
 * 전에는 여기만 애플 계열 글꼴을 따로 박아 뒀는데, 그러면 대화창은 픽셀인데
 * 그 위에 얹힌 띠만 다른 글씨가 된다 — 한 화면에 두 제품이 있는 것처럼 보인다.
 * 폰트는 `globals.css` 에서 한 번 정의하고 여기서는 이름만 부른다.
 */
const FACE = 'Galmuri11, "Galmuri14", ui-monospace, monospace';

/**
 * 얼마나 지났나. **지금이 몇 시인지는 밖에서 받는다.**
 *
 * 그리는 중에 시계를 보면 같은 값을 두 번 그렸을 때 서로 다른 답이 나오고,
 * 서버에서 그린 것과 브라우저에서 그린 것도 어긋난다. 시각은 효과 안에서
 * 한 번씩 읽어 상태로 두고, 그리는 쪽은 받은 숫자만 쓴다.
 */
function since(iso: string, now: number): string {
  if (!now) return "—";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return s + "초";
  if (s < 3600) return Math.floor(s / 60) + "분 " + (s % 60) + "초";
  return Math.floor(s / 3600) + "시간 " + Math.floor((s % 3600) / 60) + "분";
}

/**
 * 네 단계 각각이 지금 어디에 있는가.
 *
 * 서버가 "지금 3단계" 라고 말해 주지 않는다. 남아 있는 것으로 읽는다 — 설계도가
 * 몇 개 남았는지, 지난 판에 오류가 돌아왔는지. 그래야 서버와 화면이 서로 다른
 * 이야기를 하지 않는다.
 */
type StepState = "done" | "now" | "wait" | "fail";

function stepsOf(s: NonNullable<Live["session"]>): StepState[] {
  const running = s.status === "running";
  const failed = s.status === "stuck" || s.status === "stopped";
  // 승인·반려는 **사람이 본 뒤**의 상태다. 멈춘 것도 도는 것도 아니다.
  const drewAll = s.sprites === 0 || s.drawn >= s.sprites;
  const wroteAll = s.planned > 0 && s.written >= s.planned;

  // 설계는 세션이 있다는 것 자체가 끝났다는 뜻이다 — 설계 없이는 세션이 안 열린다.
  const design: StepState = "done";
  // 그림이 없는 일도 있다. 그때는 이 칸을 **끝난 것으로 둔다** — 건너뛴 칸을
  // 대기로 두면 영영 안 끝나는 칸이 하나 생긴다.
  const draw: StepState = drewAll ? "done" : running ? "now" : "fail";
  const write: StepState = !drewAll
    ? "wait"
    : wroteAll
      ? "done"
      : running
        ? "now"
        : "fail";
  const compile: StepState = !wroteAll
    ? "wait"
    : failed
      ? "fail"
      : running
        ? "now"
        : "done";
  // 마지막 칸은 기계가 못 잰다. 통과했든 막혔든 **사람이 켜서 보는 자리**라,
  // 여기서 초록으로 칠하지 않는다.
  const judge: StepState = compile === "done" ? "now" : "wait";

  return [design, draw, write, compile, judge];
}

const STEPS = [
  { no: "01", label: "설계도와 합격 기준", who: "개발자" },
  { no: "02", label: "그림", who: "아티스트" },
  { no: "03", label: "C# 스크립트 나눠 쓰기", who: "개발자" },
  { no: "04", label: "컴파일과 씬", who: "유니티" },
  { no: "05", label: "켜서 보기", who: "사장님" },
] as const;

/**
 * 칸의 색. 문구는 여기서 정하지 않는다 — **지금 붙어 있는 칸에는 직함이,
 * 끝났거나 아직인 칸에는 상태가** 들어가기 때문이다. 끝난 일에 담당을 적으면
 * 아직 그 사람이 붙어 있는 것처럼 읽힌다.
 */
const STEP_CHIP: Record<StepState, string> = {
  done: "bg-white/10 text-white/60",
  now: "bg-white text-black",
  wait: "bg-white/5 text-white/25",
  fail: "bg-white text-black",
};

const STEP_TEXT: Record<Exclude<StepState, "now">, string> = {
  done: "끝",
  wait: "대기",
  fail: "멈춤",
};

/**
 * 지금 붙어 있는 사람. **글자만이다.**
 *
 * 한때 여기에 픽셀 얼굴을 붙였다가 뺐다(2026-08-31 사장님 지시). 그림은
 * `public/cast/` 와 `lib/employees/cast.ts` 에 그대로 있으니, 다시 붙일 자리가
 * 생기면 이 조각 하나만 고치면 된다.
 */
function Who({ title }: { title: string }) {
  return (
    <span className="shrink-0  bg-white px-2 py-0.5 text-[11px] font-medium text-black">
      {title}
    </span>
  );
}

/** 묻는 쪽. 도는 동안만 자주 묻고, 안 보는 탭에서는 아예 안 묻는다. */
export default function UnityStrip({ panel = false }: { panel?: boolean }) {
  const [live, setLive] = useState<Live | null>(null);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;

    function schedule(ms: number) {
      if (!stop) timer = setTimeout(pull, ms);
    }

    async function pull() {
      if (document.hidden) return schedule(POLL_IDLE);
      try {
        const res = await fetch("/api/unity/live", { cache: "no-store" });
        if (res.ok) {
          const next = (await res.json()) as Live;
          if (!stop) setLive(next);
          return schedule(
            next.session && next.session.status === "running"
              ? POLL_RUNNING
              : POLL_IDLE,
          );
        }
      } catch {
        // 조용히 넘어간다. 상태를 못 읽은 것이 대화를 막을 이유는 없다.
      }
      schedule(POLL_IDLE);
    }

    pull();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, []);

  return <UnityStripView live={live} panel={panel} />;
}

/**
 * 보는 쪽. 데이터를 받기만 하므로 서버 없이도 화면을 확인할 수 있다 —
 * 상태 넷을 눈으로 대 보지 않고 색과 단계를 정하면, 그건 그려 본 것이 아니라
 * 상상한 것이다.
 */
export function UnityStripView({
  live,
  /**
   * 옆에 세워 두는 자리인가.
   *
   * 대화 위에 얹힌 띠일 때는 접혀 있는 것이 기본이다 — 대화를 가리면 안 되니까.
   * 옆 칸으로 나오면 반대다: 가릴 것이 없으니 접을 이유도 없고, 일이 없을 때도
   * **자리가 남아 있어야** 사람이 "여기서 보는구나" 를 안다. 그래서 빈 상태를
   * 그린다 — 띠였다면 아무것도 안 그리는 것이 맞다.
   */
  panel = false,
}: {
  live: Live | null;
  panel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // 경과 시간이 멈춰 있으면 죽은 화면처럼 보인다. 숫자는 따로 흐르게 둔다.
  const [now, setNow] = useState(0);

  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(clock);
    };
  }, []);

  const s = live?.session;
  if (!s) {
    if (!panel) return null;
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center"
        style={{ fontFamily: FACE }}
      >
        <div className="text-[13px] text-white/45">지금 도는 유니티 일이 없습니다</div>
        <div className="text-[11px] leading-relaxed text-white/25">
          대화창에서 만들 것을 말하면 여기에 진행이 뜹니다.
        </div>
      </div>
    );
  }

  const expanded = panel || open;
  const running = s.status === "running";
  const steps = stepsOf(s);
  // 접힌 줄에서 제일 먼저 읽혀야 하는 것: **지금 누구 차례인가.** 끝난 세션은
  // 아무도 안 붙어 있으므로 비운다 — 끝났는데 담당이 떠 있으면 아직 도는 줄 안다.
  const onIt = running ? STEPS[steps.indexOf("now")]?.who ?? null : null;
  const errors = s.rounds[0]?.errors ?? [];

  const runner = !live?.runnerMeasurable
    ? { text: "심부름꾼 못 잼", dot: "bg-white/20", tone: "text-white/35" }
    : !live?.runnerSeenAt
      ? { text: "심부름꾼 아직 안 옴", dot: "bg-white", tone: "text-white" }
      : (() => {
          const ms = now - new Date(live.runnerSeenAt).getTime();
          const text = "심부름꾼 " + since(live.runnerSeenAt, now) + " 전";
          // 방금 다녀갔으면 밝고, 오래됐으면 어둡다. 색이 아니라 밝기가 신호다.
          if (ms < 60_000) return { text, dot: "bg-white", tone: "text-white/90" };
          if (ms < 300_000)
            return { text, dot: "bg-white/60", tone: "text-white/60" };
          return { text, dot: "bg-white/20", tone: "text-white/35" };
        })();

  /**
   * 판정을 색 없이 가른다.
   *
   * 색을 안 쓰기로 했으니 남은 손잡이는 **명도와 반전**뿐이다. 눈에 제일 먼저
   * 들어와야 하는 것(막힘)을 채워진 흰 면으로 두고, 통과는 테두리만, 멈춤은
   * 그 중간에 둔다. 세 단계 이상 만들지 않는다 — 흑백에서 단계가 늘면 어느
   * 것이 더 급한지가 흐려진다.
   */
  const verdict =
    s.status === "compiled"
      ? { label: "컴파일 통과", className: "text-white ring-white/40" }
      : s.status === "stuck"
        ? { label: "막힘", className: "bg-white text-black ring-white" }
        : s.status === "stopped"
          ? { label: "멈춤", className: "bg-white/20 text-white ring-white/40" }
          : null;

  return (
    <div
      className={panel ? "h-full overflow-y-auto p-3" : "px-3 py-2"}
      style={{ fontFamily: FACE }}
    >
      <div
        className={
          panel
            ? "border border-white/[0.15] bg-white/[0.03]"
            : "overflow-hidden border-2 border-black bg-[#0b0b0b]"
        }
      >
        {/* ── 접힌 줄 ─────────────────────────────────────── */}
        {/*
          좁은 칸에서는 한 줄에 다 못 넣는다. 실제로 넣어 봤더니 만들려는 것이
          알약들에 밀려 **글자가 한 자도 안 남았다** — 무엇을 만드는 중인지가
          이 칸에서 제일 먼저 읽혀야 하는데, 그게 사라졌다. 그래서 옆 칸에서는
          제목을 제 줄에 두고 잰 숫자들을 그 아래로 내린다.
        */}
        {panel ? (
          <div className="space-y-2 px-3.5 py-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex shrink-0 items-center gap-1.5  bg-white/[0.06] px-2 py-1">
                <span
                  className={`h-1.5 w-1.5 ${
                    running ? "animate-pulse bg-white" : "bg-white/25"
                  }`}
                />
                <span className="text-[11px] font-semibold tracking-wide text-white/70">
                  Unity
                </span>
              </span>
              {verdict && (
                <span
                  className={`shrink-0  px-2 py-0.5 text-[11px] font-semibold ring-1 ${verdict.className}`}
                >
                  {verdict.label}
                </span>
              )}
            </div>

            <div className="text-[13px] leading-snug text-[#F5F5F7]">{s.want}</div>

            {onIt && (
              <div className="flex items-center gap-1.5">
                <Who title={onIt} />
                <span className="text-[11px] text-white/45">가 붙어 있습니다</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              <span className=" bg-white/[0.06] px-2 py-0.5 text-[11px] tabular-nums text-white/60">
                {s.round}판
              </span>
              <span className=" bg-white/[0.06] px-2 py-0.5 text-[11px] tabular-nums text-white/45">
                {since(s.startedAt, now)}
              </span>
              <span
                className={`inline-flex items-center gap-1.5  bg-white/[0.06] px-2 py-0.5 text-[11px] ${runner.tone}`}
              >
                <span className={`h-1.5 w-1.5  ${runner.dot}`} />
                {runner.text}
              </span>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={expanded}
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-white/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <span className="inline-flex shrink-0 items-center gap-1.5  bg-white/[0.06] px-2 py-1">
              <span
                className={`h-1.5 w-1.5  ${
                  running ? "animate-pulse bg-white" : "bg-white/25"
                }`}
              />
              <span className="text-[11px] font-semibold tracking-wide text-white/70">
                Unity
              </span>
            </span>

            <span className="min-w-0 flex-1 truncate text-[13px] text-[#F5F5F7]">
              {s.want}
            </span>

            {onIt && <Who title={onIt} />}

            {verdict && (
              <span
                className={`shrink-0  px-2 py-0.5 text-[11px] font-semibold ring-1 ${verdict.className}`}
              >
                {verdict.label}
              </span>
            )}

            <span className="shrink-0  bg-white/[0.06] px-2 py-0.5 text-[11px] tabular-nums text-white/60">
              {s.round}판
            </span>
            <span className="hidden shrink-0  bg-white/[0.06] px-2 py-0.5 text-[11px] tabular-nums text-white/45 sm:inline">
              {since(s.startedAt, now)}
            </span>
            <span
              className={`hidden shrink-0 items-center gap-1.5  bg-white/[0.06] px-2 py-0.5 text-[11px] sm:inline-flex ${runner.tone}`}
            >
              <span className={`h-1.5 w-1.5  ${runner.dot}`} />
              {runner.text}
            </span>
            <span className="shrink-0 text-white/25">{open ? "▾" : "▸"}</span>
          </button>
        )}

        {/* ── 펼친 속 ─────────────────────────────────────── */}
        {expanded && (
          <div className="space-y-2.5 border-t border-white/[0.06] p-3">
            {/* 네 단계 */}
            <div className=" border border-white/[0.06] bg-black/25 p-3">
              <div className="mb-2 text-[10px] font-semibold tracking-[0.08em] text-white/35">
                진행
              </div>
              <ul className="space-y-1.5">
                {STEPS.map((step, i) => {
                  const state = steps[i];
                  return (
                    <li key={step.no} className="flex items-center gap-2.5">
                      <span
                        className={`h-4 w-4 shrink-0  text-center text-[9px] font-bold leading-4 ${
                          state === "done"
                            ? "bg-white/60 text-black"
                            : state === "now"
                              ? "bg-white text-black"
                              : state === "fail"
                                ? "bg-white text-black"
                                : "bg-white/10 text-white/30"
                        }`}
                      >
                        {state === "done" ? "✓" : state === "fail" ? "!" : ""}
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-white/30">
                        {step.no}
                      </span>
                      <span
                        className={`min-w-0 flex-1 truncate text-[12px] ${
                          state === "wait" ? "text-white/30" : "text-[#E5E5EA]"
                        }`}
                      >
                        {step.label}
                        {i === 2 && s.planned > 0 && (
                          <span className="ml-1.5 tabular-nums text-white/35">
                            {s.written}/{s.planned}
                          </span>
                        )}
                      </span>
                      {state === "now" ? (
                        <Who title={step.who} />
                      ) : (
                        <span
                          className={`shrink-0  px-2 py-0.5 text-[10px] font-semibold ${STEP_CHIP[state]}`}
                        >
                          {STEP_TEXT[state]}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* 유니티가 돌려준 오류 */}
            {errors.length > 0 && (
              <div className=" border border-white/[0.05] bg-black/40 p-3">
                <div className="mb-2 text-[10px] font-semibold tracking-[0.08em] text-white/35">
                  이번 판에 돌아온 오류 {errors.length}건
                </div>
                <ul className="space-y-1 font-mono text-[11px] leading-relaxed">
                  {errors.slice(0, 4).map((e, i) => (
                    <li key={i} className={panel ? "break-words text-white/85" : "truncate text-white/85"}>
                      <span className="text-white/35">
                        {e.file.split("/").pop()}({e.line}){" "}
                      </span>
                      {e.message}
                    </li>
                  ))}
                  {errors.length > 4 && (
                    <li className="text-white/30">그 밖 {errors.length - 4}건</li>
                  )}
                </ul>
              </div>
            )}

            {/* 판별 기록 */}
            {s.rounds.length > 0 && (
              <div className=" border border-white/[0.05] bg-white/[0.02] p-3">
                <div className="mb-2 text-[10px] font-semibold tracking-[0.08em] text-white/35">
                  판별 기록
                </div>
                <ul className="space-y-1 text-[11px]">
                  {s.rounds.map((r) => (
                    <li key={r.round} className="flex gap-2.5">
                      <span className="w-7 shrink-0 tabular-nums text-white/35">
                        {r.round}판
                      </span>
                      <span className="w-24 shrink-0 tabular-nums text-white/35">
                        파일 {r.files} · 오류 {r.errors.length}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-white/65">
                        {r.note ?? ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-1 px-0.5 text-[11px] text-white/30">
              <span>울타리 {s.scope}</span>
              {s.sceneMethod && <span>씬 {s.sceneMethod}</span>}
              <span className="tabular-nums">파일 {s.planned}개</span>
            </div>

            {/*
              통과했을 때는 서버 문구를 걸지 않는다. 아래 노란 칸이 같은 말을
              더 정확히(기준 몇 개인지까지) 하고 있어서, 둘을 다 걸면 화면이
              같은 말을 두 번 한다.
            */}
            {s.endedWhy && s.status !== "compiled" && s.status !== "approved" &&
              s.status !== "rejected" && (
              <p className="px-0.5 text-[12px] leading-relaxed text-white/70">
                {s.endedWhy}
              </p>
            )}

            {/* 이 제품이 절대 안 하는 말: "다 됐습니다". 컴파일은 문법이 맞다는
                뜻이지 원하던 것이 됐다는 뜻이 아니다. */}
            {/* 컴파일이 끝난 판에도 "왜 이렇게 끝났는지" 는 보여 준다.
                기계가 못 잰 판이 여기로 오기 때문이다 — 그 사실이 안 보이면
                사람은 "다 재고 통과했다" 로 읽는다. */}
            {s.endedWhy && s.status === "compiled" && (
              <p className="px-0.5 text-[12px] leading-relaxed text-amber-200/70">
                {s.endedWhy}
              </p>
            )}

            {/* 도장을 찍어도 이 줄은 그대로 남는다. `approved` 는 사람이 봤다는
                뜻이지 기계가 쟀다는 뜻이 아니라서, 여기서 사라지면 **못 잰 것이
                사람의 도장 뒤로 숨는다.** */}
            {(s.status === "compiled" || s.status === "approved" ||
              s.status === "rejected") && (
              <div className="space-y-2">
                <p className=" border border-white/25 bg-white/[0.06] px-3 py-2 text-[12px] leading-relaxed text-white/80">
                  합격 기준 {s.criteriaCount}개는 <strong>아직 확인되지 않았습니다.</strong>{" "}
                  컴파일과 씬 생성은 기계가 쟀고, 원하던 것이 됐는지는 켜 보셔야 압니다.
                </p>
                <ApproveGate session={s} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
