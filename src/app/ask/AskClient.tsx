"use client";

import { Waiting } from "@/components/Waiting";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import PreviewPanel, { PreviewStrip, previewSummary, usePreview, type PlanCard } from "@/app/ask/PreviewPanel";
import { ChatMarkdown } from "@/components/ChatMarkdown";
import RoutingNotice from "./RoutingNotice";

/**
 * 회사에게 말을 거는 화면.
 *
 * 직원을 고르는 자리가 없다. 그게 이 화면의 전부다 — 매니저는 필요한 것을
 * 말하고, 누구를 뽑을지와 누가 할지는 회사가 정한다. 무슨 일이 있었는지는
 * 대화 안에 조용히 적힌다("Maya 를 뽑았습니다", "업무를 만들었습니다")
 * — 사람이 다음에 무엇을 눌러야 하는지 알 수 있을 만큼만.
 */


/**
 * 브라우저가 들고 다니는 방문자 표시.
 *
 * 로그인 없이 쓰는 사람을 대충 세기 위한 값이다. 사람을 식별하지 않고, 지우면
 * 초기화된다 — 그래서 이것은 편의이지 방어가 아니며, 진짜 벽은 서버의 일일
 * 총액이다.
 */
function visitorId(): string {
  const KEY = "rookery.visitor";
  try {
    const found = localStorage.getItem(KEY);
    if (found) return found;
    const made = crypto.randomUUID();
    localStorage.setItem(KEY, made);
    return made;
  } catch {
    // 저장이 막힌 브라우저(사생활 모드 등)에서도 대화는 되어야 한다.
    return "no-storage";
  }
}
/** 스트림을 줄로 자르는 기준. 코드값으로 둔다 — 이 파일을 쓰는 길에서
 *  역슬래시가 먹혀 문자열이 끊긴 적이 있다. */
const NEWLINE = String.fromCharCode(10);

/** 그림 파일인가. href 가 있는 그림은 링크 대신 그림으로 그린다. */
const IMG_RX = /\.(png|jpe?g|webp)$/i;


type Source = { title: string; url: string };
type Option = { label: string; description: string | null };
type Turn = {
  role: "user" | "assistant";
  content: string;
  hired?: { name: string; why: string } | null;
  /** `returned` 는 결과가 대화에 붙었다는 뜻. 그 뒤로는 안 묻는다. */
  assignment?: { id: string; title: string; queued: boolean; returned?: boolean } | null;
  /** 시킨 일이 끝나서 돌아온 턴. 답이 아니라 **결과**라 조금 다르게 그린다. */
  returnedWork?: boolean;
  /** 이 턴이 무엇인가(45회차): 결과·검사·계획 확인. 서버가 정한다. */
  kind?: "result" | "checks" | "approval" | "exhausted";
  /** 이 턴에 대고 누를 수 있는 것. 사장님: "예시 버튼은 편의가 아니다" — 편의는 눈앞의 것에 대고 누르는 것. */
  actions?: { label: string; text: string }[];
  /** 돌아온 일에 딸린 파일. 글 파일(contents)은 브라우저가, 저장소 파일(href)은 서버를 거쳐 연다. */
  files?: { path: string; contents?: string; href?: string }[] | null;
  needsOnboarding?: { id: string; name: string } | null;
  options?: Option[] | null;
  sources?: Source[] | null;
  searched?: string[] | null;
  images?: { dataUrl: string; prompt: string }[] | null;
};

export default function AskClient({
  initial,
  task,
}: {
  /** 저장된 대화를 열고 들어올 때. 없으면 새 대화다. */
  initial?: { id: string; turns: Turn[] } | null;
  /** 과제 안에서 열었을 때. 여기서 시작한 대화는 그 과제에 들어간다. */
  task?: { id: string; title: string } | null;
} = {}) {
  /** 익명일 때 남은 횟수. 로그인 상태면 null 이라 아무것도 안 보인다. */
  const [turnsLeft, setTurnsLeft] = useState<number | null>(null);
  /** 이어서 저장할 대화. 새 대화면 null 이고 첫 턴 뒤에 서버가 채워 준다. */
  const [conversationId, setConversationId] = useState<string | null>(
    initial?.id ?? null,
  );
  /** 이번 턴에 붙일 사진. 보내면 비운다. */
  const [attached, setAttached] = useState<{ name: string; b64: string }[]>([]);
  const [turns, setTurns] = useState<Turn[]>(initial?.turns ?? []);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  /** 지금 뒤에서 무엇을 하는 중인지. 답이 오면 비운다. */
  const [doing, setDoing] = useState<string | null>(null);
  /** 아직 안 끝난 일이 어느 단계인지(업무 id → "Dev: 코드를 쓰는 중"). */
  const [steps, setSteps] = useState<Record<string, string>>({});
  /** 도는 일의 계획 카드(업무 id → 카드). 오른쪽 칸 맨 위에 보인다. */
  const [plans, setPlans] = useState<Record<string, PlanCard>>({});
  /**
   * 유니티 창이 결과(사진)를 붙이는 것을 지켜보는 기한. 일이 돌아온 뒤 30분.
   * 그 안에 사장님이 유니티에서 "짓고 재기" 를 누르면 그 결과가 새로 고침 없이
   * 여기 붙는다. 기한이 지나면 묻기를 멈춘다 — 영원히 묻는 탭은 지친다.
   */
  const [watchUntil, setWatchUntil] = useState<number>(() =>
    (initial?.turns ?? []).some((t) => t.returnedWork) ? Date.now() + 30 * 60_000 : 0,
  );
  const sinceRef = useRef<string>(new Date().toISOString());
  /** 미리보기가 다시 읽을 때(일이 돌아왔을 때 +1). */
  const [panelKey, setPanelKey] = useState(0);
  const preview = usePreview(conversationId, panelKey + turns.length);
  const [previewOpen, setPreviewOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  /** 45회차: "고칠게요"·"수정 요청" 은 무엇을 고칠지 사람이 쓴다 — 커서만 보낸다. */
  const inputRef = useRef<HTMLInputElement>(null);
  // 열 때와 일이 돌아왔을 때 끝으로. 지난 대화가 길면 첫 줄이 아니라 마지막 줄이 보여야 한다(09-07).
  useEffect(() => {
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end" }));
  }, [turns.length]);

  /**
   * 시킨 일이 끝나면 **여기로** 돌아온다.
   *
   * 업무 화면은 2026-09-05 에 지웠다 — 로키는 이 대화 하나다. 그래서 어느 턴에
   * 붙인 일이 아직 안 끝났으면, 화면이 열려 있는 동안 몇 초마다 물어보고, 끝난
   * 것은 서버가 그 대화에 턴으로 붙여 준 것을 받아 그린다. 닫았다 다시 열면
   * 이미 붙어 있다(저장된 턴이라).
   *
   * 다 끝나면 묻기를 멈춘다. 물을 것이 없는데 계속 물으면 서버가 아니라 사람이
   * 먼저 지친다 — 탭이 늘 무언가를 하고 있는 것처럼 보이니까.
   */
  const pendingWork = turns.some((t) => t.assignment && !t.assignment.returned);
  const watching = watchUntil > Date.now();
  useEffect(() => {
    if (!conversationId || (!pendingWork && !watching)) return;
    let alive = true;
    const tick = async () => {
      try {
        const since = sinceRef.current;
        const res = await fetch(
          `/api/conversations/${conversationId}/work?since=${encodeURIComponent(since)}`,
        );
        if (!res.ok || !alive) return;
        const data = (await res.json()) as {
          pending: number;
          posted: { role: "assistant"; content: string; files?: { path: string; contents?: string; href?: string }[] }[];
          steps?: { assignmentId: string; who: string; step: string; plan?: PlanCard }[];
        };
        if (!alive) return;
        sinceRef.current = new Date().toISOString();
        setSteps(Object.fromEntries((data.steps ?? []).map((x) => [x.assignmentId, `${x.who}: ${x.step}`])));
        setPlans(Object.fromEntries((data.steps ?? []).filter((x) => x.plan).map((x) => [x.assignmentId, { ...x.plan!, who: x.who }])));
        if (data.posted.length > 0) {
          setTurns((prev) => [
            ...prev,
            ...data.posted.map((m) => ({ ...m, returnedWork: true, files: m.files ?? null })),
          ]);
          setWatchUntil(Date.now() + 30 * 60_000);
          setPanelKey((k) => k + 1);
        }
        if (data.pending === 0) {
          // 더 기다릴 것이 없다. 표시를 바꿔 묻기를 멈춘다.
          setTurns((prev) =>
            prev.map((t) =>
              t.assignment ? { ...t, assignment: { ...t.assignment, returned: true } } : t,
            ),
          );
        }
      } catch {
        // 한 번 못 물어본 것은 다음에 또 묻는다.
      }
    };
    void tick();
    const timer = setInterval(tick, 6000);
    // 감시 기한이 지나면 스스로 멈춘다.
    const stop =
      watching && !pendingWork
        ? setTimeout(() => setWatchUntil(0), Math.max(0, watchUntil - Date.now()))
        : null;
    return () => {
      alive = false;
      clearInterval(timer);
      if (stop) clearTimeout(stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, pendingWork, watching]);

  /**
   * 돌아온 파일을 브라우저에서 연다 / 저장한다. 서버는 파일을 실행하지 않는다 —
   * 여는 것은 사람의 브라우저다. HTML 한 파일짜리 게임이면 새 탭에서 바로 돈다.
   */
  function blobUrl(f: { path: string; contents?: string }): string {
    const type = f.path.endsWith(".html") ? "text/html" : "text/plain";
    return URL.createObjectURL(new Blob([f.contents ?? ""], { type }));
  }
  function openFile(f: { path: string; contents?: string }) {
    window.open(blobUrl(f), "_blank", "noopener");
  }
  function saveFile(f: { path: string; contents?: string }) {
    const a = document.createElement("a");
    a.href = blobUrl(f);
    a.download = f.path.split("/").pop() ?? "file";
    a.click();
  }

  /**
   * 파일을 base64 로. 데이터 URL 접두사는 떼고 보낸다 — 서버가 순수 base64 를 받는다.
   */
  function readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const s = String(r.result);
        resolve(s.slice(s.indexOf(",") + 1));
      };
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }

  async function attach(files: FileList | null) {
    if (!files) return;
    const next: { name: string; b64: string }[] = [];
    // 한 턴에 넉 장까지. 비전 호출은 장수에 비례해 비싸진다.
    for (const f of Array.from(files).slice(0, 4)) {
      if (!f.type.startsWith("image/")) continue;
      next.push({ name: f.name, b64: await readFile(f) });
    }
    setAttached((prev) => [...prev, ...next].slice(0, 4));
  }

  async function send(message: string) {
    if (!message.trim() || busy) return;
    setBusy(true);
    const history = [
      ...turns,
      {
        role: "user" as const,
        content: message,
        // 보낸 사진을 그 말풍선에 남긴다. 보내자마자 사라지면 안 간 것처럼 보인다.
        images: attached.map((a) => ({
          dataUrl: `data:image/png;base64,${a.b64}`,
          prompt: a.name,
        })),
      },
    ];
    setTurns(history);
    setText("");
    setAttached([]);

    try {
      // 경로가 하나다. 무엇을 할지는 **말한 내용으로** 정해지지, 사용자가
      // 미리 고른 모드로 정해지지 않는다.
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((t) => ({ role: t.role, content: t.content })),
          visitor: visitorId(),
          conversationId,
          taskId: task?.id ?? null,
          images: attached.map((a) => a.b64),
        }),
      });

      if (!res.body) {
        setTurns([...history, { role: "assistant", content: "답이 오지 않았습니다." }]);
        return;
      }

      // 줄 단위로 읽는다. 조각은 줄 중간에서 끊겨 오므로, 마지막 조각은
      // 다음 덩어리가 올 때까지 들고 있는다 — 안 그러면 반쪽짜리 JSON 을
      // 파싱하려다 멀쩡한 답을 버린다.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let rest = "";
      let landed = false;

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        rest += decoder.decode(value, { stream: true });
        const lines = rest.split(NEWLINE);
        rest = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let event: {
            type?: string;
            text?: string;
            error?: string;
            [k: string]: unknown;
          };
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }

          if (event.type === "status") {
            setDoing(String(event.text ?? ""));
          } else if (event.type === "error") {
            landed = true;
            setTurns([
              ...history,
              { role: "assistant", content: String(event.error ?? "문제가 생겼습니다.") },
            ]);
          } else if (event.type === "done") {
            landed = true;
            const data = event as unknown as {
              reply: string;
              hired?: Turn["hired"];
              assignment?: Turn["assignment"];
              needsOnboarding?: Turn["needsOnboarding"];
              options?: Option[] | null;
              sources?: Source[] | null;
              searched?: string[] | null;
              images?: { dataUrl: string; prompt: string }[] | null;
              turnsLeft?: number;
              conversationId?: string;
            };
            setTurns([
              ...history,
              {
                role: "assistant",
                content: data.reply,
                hired: data.hired,
                assignment: data.assignment,
                needsOnboarding: data.needsOnboarding,
                options: data.options,
                sources: data.sources,
                searched: data.searched,
                images: data.images,
              },
            ]);
            if (typeof data.turnsLeft === "number") setTurnsLeft(data.turnsLeft);
            if (typeof data.conversationId === "string")
              setConversationId(data.conversationId);
          }
        }
      }

      // 스트림이 아무 답도 없이 닫힌 경우. 조용히 두면 화면에 사용자 말만 남고
      // 아무 일도 없었던 것처럼 보인다.
      if (!landed) {
        setTurns([
          ...history,
          { role: "assistant", content: "답이 끊겼습니다. 다시 보내 주십시오." },
        ]);
      }
    } catch {
      setTurns([...history, { role: "assistant", content: "연결이 끊겼습니다." }]);
    } finally {
      setBusy(false);
      setDoing(null);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end" }));
    }
  }

  const last = turns[turns.length - 1];

  return (
    // 위쪽 여백은 장식이 아니다. 좌우 모서리에 설정과 과제 버튼이 떠 있어서,
    // 이만큼 내리지 않으면 첫 줄이 버튼 밑에 깔린다.
    // `pixel` 은 globals.css 에 있다 — 폰트·종이색·픽셀 보간을 한 번에 켠다.
    // 이 화면에만 붙인다: 대시보드는 표가 빽빽해서 픽셀 폰트가 오히려 나쁘다.
    <div className="pixel mx-auto flex h-[calc(100vh-4rem)] max-w-2xl flex-col px-4 pt-9 lg:max-w-[1180px] lg:flex-row lg:gap-6">
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col lg:max-w-2xl">
      {task && (
        <p className="pt-2 text-center text-xs text-[var(--rk-400)]">
          과제 · {task.title}
        </p>
      )}
      {turnsLeft !== null && (
        <p className="pt-2 text-center text-xs text-[var(--rk-400)]">
          로그인 없이 {turnsLeft}번 더 쓸 수 있습니다 ·{" "}
          <a className="underline" href="/login">
            로그인
          </a>
          하면 제한 없이, 대화도 저장됩니다.
        </p>
      )}

      {/*
        유니티 일이 도는 동안의 진행. **대화 흐름 밖, 그러나 이 화면 안이다.**

        처음에는 `/dashboard/chat` 에 붙였는데 그 화면은 메뉴에서 닿지도 않는
        옛 화면이었다 — 사람이 실제로 쓰는 곳은 여기다. 화면을 안 보고 "대화창"
        이라는 말만 보고 붙이면 이렇게 된다.

        옆 칸이 아니라 띠로 둔다. 이 화면은 아이패드 분할에서도 열리고, 거기서
        360px 칸을 떼면 정작 대화가 반으로 줄어든다.
      */}
      {/*
        판단이 계획한 자리에서 안 돌고 있을 때만 뜨는 줄. 평소에는 아무것도
        안 그린다 — 계획대로일 때 초록불을 켜면 그 불은 곧 안 보게 된다.
      */}
      <RoutingNotice />

      <div className="flex-1 space-y-4 overflow-y-auto py-6">
        {/*
          빈 화면에 다섯을 세워 뒀다가 뺐다(2026-08-31 사장님 지시). 얼굴은
          **일하는 중일 때** 나오는 것으로 남긴다 — 아무 일도 없는데 서 있으면
          장식이고, 장식은 매번 봐야 하는 자리에서 제일 먼저 지겨워진다.
        */}
        {turns.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--rk-600)]">
              {task
                ? `"${task.title}" 안에서 나눈 이야기만 여기 모입니다.`
                : "무엇이든 물어보세요. 찾아봐야 할 것은 찾아보고, 시간이 드는 일은 사람을 붙여 업무로 만듭니다."}
            </p>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={t.role === "user" ? "text-right" : ""}>
            <div
              className={
                "inline-block max-w-[85%] border-2 border-[var(--rk-ink)] px-4 py-2.5 text-sm " +
                (t.role === "user" ? "whitespace-pre-wrap " : "") +
                (t.role === "user"
                  ? "bg-[var(--rk-ink)] text-[var(--rk-paper)]"
                  : "bg-[var(--rk-100)] text-[var(--rk-ink)]") +
                // 시킨 일의 결과는 답이 아니라 **돌아온 것**이다. 왼쪽 띠 하나로
                // 가른다 — 같은 회색 상자면 "누가 언제 한 말인지" 를 읽어야 안다.
                (t.returnedWork ? " border-l-8 border-l-[#E0703A]" : "")
              }
            >
              {t.role === "assistant" ? <ChatMarkdown>{t.content}</ChatMarkdown> : t.content}
            </div>
            {t.files?.some((f) => f.href && IMG_RX.test(f.path)) && (
              // 그림은 링크가 아니라 **그림**으로. 유니티가 찍은 게임 화면이 여기 온다 —
              // 사장님은 유니티를 안 열고도 무엇이 만들어졌는지 본다.
              <div className="mt-2 flex flex-wrap gap-2">
                {t.files
                  .filter((f) => f.href && IMG_RX.test(f.path))
                  .map((f) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={f.href}
                      src={f.href}
                      alt={f.path}
                      className="max-h-80 rounded-xl border-2 border-[var(--rk-ink)]"
                    />
                  ))}
              </div>
            )}
            {t.files && t.files.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-2">
                {t.files.map((f) => (
                  <span key={f.href ?? f.path} className="flex items-center gap-1 text-xs">
                    <code className="px-1">{f.path}</code>
                    {f.href ? (
                      <a className="underline" href={f.href} target="_blank" rel="noopener">
                        받기
                      </a>
                    ) : (
                      <>
                        <button type="button" className="underline" onClick={() => openFile(f)}>
                          열기
                        </button>
                        <button type="button" className="underline" onClick={() => saveFile(f)}>
                          저장
                        </button>
                      </>
                    )}
                  </span>
                ))}
              </div>
            )}
            {t.actions && t.actions.length > 0 && (
              // 45회차: 계획 확인은 눌러서 답하고, 결과에는 다음 일을 대고 누른다.
              // `text` 가 비면 입력칸으로 커서만 보낸다 — 무엇을 고칠지는 사람이 쓴다.
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {t.actions.map((b) => (
                  <button
                    key={b.label}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (b.text) void send(b.text);
                      else inputRef.current?.focus();
                    }}
                    className={
                      "border-2 px-2.5 py-1 text-xs disabled:opacity-40 " +
                      (b.label === "시작"
                        ? "border-[#E0703A] bg-[#E0703A] text-[var(--rk-paper)]"
                        : "border-[var(--rk-ink)] bg-[var(--rk-paper)] text-[var(--rk-ink)] hover:bg-[var(--rk-100)]")
                    }
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            )}
            {t.hired && (
              <p className="mt-1.5 text-xs text-[var(--rk-400)]">
                {t.hired.name} 고용 — {t.hired.why}
              </p>
            )}
            {t.assignment && (
              <p className="mt-1.5 text-xs text-[var(--rk-400)]">
                작업 시작 · {t.assignment.title}
                {t.assignment.queued ? " (차례 기다리는 중)" : ""}
                {t.assignment.returned
                  ? " — 작업 완료"
                  : steps[t.assignment.id]
                    ? ` — ${steps[t.assignment.id]}…`
                    : " — 끝나면 여기 붙어요"}
              </p>
            )}
            {t.images && t.images.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {t.images.map((img, k) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={k}
                    src={img.dataUrl}
                    alt={img.prompt}
                    className="max-h-72 rounded-xl border border-[var(--rk-200)]"
                  />
                ))}
              </div>
            )}
            {t.searched && t.searched.length > 0 && (
              <p className="mt-1.5 text-xs text-[var(--rk-400)]">
                찾아본 것: {t.searched.join(" · ")}
              </p>
            )}
            {t.sources && t.sources.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 text-xs text-[var(--rk-400)]">
                {t.sources.map((s) => (
                  <li key={s.url}>
                    <a className="underline" href={s.url} target="_blank" rel="noreferrer">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {t.needsOnboarding && (
              <p className="mt-1.5 text-xs text-amber-600">
                {t.needsOnboarding.name} 은(는) 아직 교육 전입니다 — 끝나야 일을 받을 수 있습니다.
              </p>
            )}
          </div>
        ))}
        {busy && (
          /*
            지금 무엇을 하는 중인지 그대로 적는다 — 뒤에서 여러 곳에 붙는 것이
            이 제품의 값어치인데, 안 보이면 지연으로만 느껴진다. 거기에 흐르는
            초를 더한다: 단계 글자만 있으면 그 단계에서 멈춘 것처럼 보인다.
          */
          <Waiting stage={doing} className="text-[var(--rk-400)]" />
        )}
        <div ref={endRef} />
      </div>

      {last?.options && last.options.length > 0 && !busy && (
        <div className="flex flex-wrap gap-2 pb-3">
          {last.options.map((o) => (
            <button
              key={o.label}
              onClick={() => send(o.label)}
              title={o.description ?? undefined}
              className="border border-[var(--rk-400)] px-3 py-1.5 text-sm hover:bg-[var(--rk-100)]"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {attached.length > 0 && (
        <div className="flex flex-wrap gap-2 pb-2">
          {attached.map((a, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/png;base64,${a.b64}`}
                alt={a.name}
                className="h-16 w-16 border border-[var(--rk-200)] object-cover"
              />
              <button
                onClick={() =>
                  setAttached((prev) => prev.filter((_, k) => k !== i))
                }
                aria-label="빼기"
                className="absolute -right-1.5 -top-1.5 h-5 w-5 bg-[var(--rk-ink)] text-xs text-[var(--rk-paper)]"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {conversationId && <PreviewStrip summary={previewSummary(preview.data, steps)} onOpen={() => setPreviewOpen(true)} />}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
        className="flex gap-2 border-t border-[var(--rk-200)] py-3"
      >
        <label className="flex cursor-pointer items-center border-2 border-[var(--rk-ink)] bg-transparent px-3 text-[var(--rk-ink)] hover:bg-[var(--rk-100)]">
          <Icon name="attach" size={20} />
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void attach(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="무엇이든 물어보세요"
          className="flex-1 border-2 border-[var(--rk-ink)] bg-transparent px-4 py-3 text-sm text-[var(--rk-ink)] outline-none placeholder:text-[var(--rk-400)] focus:bg-[var(--rk-100)]"
        />
        <button
          disabled={busy || !text.trim()}
          className="border-2 border-[var(--rk-ink)] bg-[var(--rk-ink)] px-5 text-sm font-medium text-[var(--rk-paper)] disabled:opacity-30"
        >
          보내기
        </button>
      </form>
    </div>
    <PreviewPanel
      conversationId={conversationId}
      preview={preview}
      steps={steps}
      plans={plans}
      open={previewOpen}
      onOpenChange={setPreviewOpen}
      onReverted={() => { setPanelKey((k) => k + 1); }}
    />
    </div>
  );
}
