"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import UnityStrip from "@/app/dashboard/chat/UnityStrip";
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

type Source = { title: string; url: string };
type Option = { label: string; description: string | null };
type Turn = {
  role: "user" | "assistant";
  content: string;
  hired?: { name: string; why: string } | null;
  assignment?: { id: string; title: string; queued: boolean } | null;
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
  const endRef = useRef<HTMLDivElement>(null);

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
    <div className="pixel mx-auto flex h-[calc(100vh-4rem)] max-w-2xl flex-col px-4 pt-9">
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

      <UnityStrip />

      <div className="flex-1 space-y-4 overflow-y-auto py-6">
        {/*
          빈 화면에 다섯을 세워 뒀다가 뺐다(2026-08-31 사장님 지시). 얼굴은
          **일하는 중일 때** 나오는 것으로 남긴다 — 아무 일도 없는데 서 있으면
          장식이고, 장식은 매번 봐야 하는 자리에서 제일 먼저 지겨워진다.
        */}
        {turns.length === 0 && (
          <p className="text-sm text-[var(--rk-600)]">
            {task
              ? `"${task.title}" 안에서 나눈 이야기만 여기 모입니다.`
              : "무엇이든 물어보세요. 찾아봐야 할 것은 찾아보고, 시간이 드는 일은 사람을 붙여 업무로 만듭니다."}
          </p>
        )}
        {turns.map((t, i) => (
          <div key={i} className={t.role === "user" ? "text-right" : ""}>
            <div
              className={
                "inline-block max-w-[85%] whitespace-pre-wrap border-2 border-[var(--rk-ink)] px-4 py-2.5 text-sm " +
                (t.role === "user"
                  ? "bg-[var(--rk-ink)] text-[var(--rk-paper)]"
                  : "bg-[var(--rk-100)] text-[var(--rk-ink)]")
              }
            >
              {t.content}
            </div>
            {t.hired && (
              <p className="mt-1.5 text-xs text-[var(--rk-400)]">
                {t.hired.name} 고용 — {t.hired.why}
              </p>
            )}
            {t.assignment && (
              <p className="mt-1.5 text-xs text-[var(--rk-400)]">
                업무 생성: {t.assignment.title}
                {t.assignment.queued ? " (대기열에 넣음)" : ""}{" "}
                <Link className="underline" href={`/dashboard/assignments`}>
                  보기
                </Link>
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
                <Link className="underline" href={`/dashboard/employees/${t.needsOnboarding.id}`}>
                  {t.needsOnboarding.name} 교육 마치기
                </Link>{" "}
                — 끝나야 일을 받을 수 있습니다.
              </p>
            )}
          </div>
        ))}
        {busy && (
          <p className="text-sm text-[var(--rk-400)]">
            {/*
              점 세 개만 있으면 멈춘 건지 도는 건지 알 수 없다. 지금 무엇을
              하는 중인지 그대로 적는다 — 뒤에서 여러 곳에 붙는 것이 이 제품의
              값어치인데, 안 보이면 지연으로만 느껴진다.
            */}
            {doing ?? "…"}
          </p>
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
  );
}
