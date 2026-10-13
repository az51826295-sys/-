"use client";
// i18n-ids: 글 넣기 모드계산 일판 코드를 쓰는 중 방금들어감 전환 모드띠 로키얼굴 결 큰얼굴 좁은창 창단추 화면보기 화면보기띠 예시 시연 대화중 일하는중 조용함 좁게 먼저 먼저건말 딱지 시작 모드 하는일 몇분 바꾸기 창바꾸기 도는일

import { Waiting } from "@/components/Waiting";
import { 모드계산, use방금들어감, 전환, 모드띠, 로키얼굴, use결, 큰얼굴 } from "./모드";
import { use좁은창, 창단추 } from "./좁은창";
import { use화면보기, 화면보기띠 } from "./화면보기";
import 예시 from "./예시";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import PreviewPanel, { PreviewStrip, previewSummary, usePreview, type PlanCard } from "@/app/ask/PreviewPanel";
import { ChatMarkdown } from "@/components/ChatMarkdown";
import { useT } from "@/lib/i18n/client";
import { ROOKERY } from "@/lib/i18n/dict/rookery";

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
/** 결과 본문의 "## 파일 N개" 아래 코드 전문을 목록 한 줄로 바꾼다(옛 턴용). */
function stripFileBodies(md: string): string {
  const i = md.indexOf("\n## 파일 "); // i18n-skip (서버 결과 모양·모델에 주는 글)
  if (i < 0) return md;
  const head = md.slice(0, i);
  const rest = md.slice(i);
  if (!/```/.test(rest)) return md;
  const names = [...rest.matchAll(/### `([^`]+)`/g)].map((m) => "- `" + m[1] + "`");
  const tail = rest.split(/\n---\n/).slice(1).join("\n---\n");
  return head + "\n## 파일 " + names.length + "개\n\n" + names.join("\n") + "\n(아래 열기 · 저장, 또는 오른쪽 미리보기)" + (tail ? "\n\n---\n" + tail : ""); // i18n-skip (서버 결과 모양·모델에 주는 글)
}

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
  /** **로키가 화면을 보고 먼저 건 말.** 사람이 물어서 나온 답이 아니라서 다르게 그린다. */
  먼저건말?: boolean;
  /** 돌아온 일에 딸린 파일. 글 파일(contents)은 브라우저가, 저장소 파일(href)은 서버를 거쳐 연다. */
  files?: { path: string; contents?: string; href?: string }[] | null;
  needsOnboarding?: { id: string; name: string } | null;
  options?: Option[] | null;
  sources?: Source[] | null;
  searched?: string[] | null;
  images?: { dataUrl: string; prompt: string }[] | null;
};

/**
 * 173회차: **지금 말하는 기기**를 브라우저가 스스로 알려 주는 대로 모은다(지어내지 않는다 — 없는 값은 null).
 * 사장님이 아이패드에서 "내가 무슨 기종인지 알 수 있어?" → 로키 "못 봐" → "첫번째 실패". 손이 없어도 이건 안다.
 * 게임을 어느 방식으로 만들지에 필요한 건 모델명이 아니라 화면·터치·포인터 락·GPU 다.
 */
function deviceFacts() {
  try {
    const n = navigator as Navigator & { deviceMemory?: number; standalone?: boolean };
    let gpu: string | null = null;
    try {
      const c = document.createElement("canvas");
      const gl = (c.getContext("webgl") ?? c.getContext("experimental-webgl")) as WebGLRenderingContext | null;
      const ext = gl?.getExtension("WEBGL_debug_renderer_info");
      if (gl && ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)).slice(0, 200);
    } catch { /* 안 알려 주면 null */ }
    return {
      ua: navigator.userAgent.slice(0, 400),
      platform: n.platform ? String(n.platform).slice(0, 80) : null,
      touchPoints: Math.max(0, Math.min(40, n.maxTouchPoints ?? 0)),
      screen: { w: Math.round(screen.width), h: Math.round(screen.height), dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100 },
      viewport: { w: Math.round(window.innerWidth), h: Math.round(window.innerHeight) },
      cores: n.hardwareConcurrency ?? null,
      memoryGB: typeof n.deviceMemory === "number" ? n.deviceMemory : null,
      gpu,
      pointerLock: "pointerLockElement" in document && typeof (document.body as HTMLElement & { requestPointerLock?: unknown }).requestPointerLock === "function",
      standalone: n.standalone === true || window.matchMedia?.("(display-mode: standalone)")?.matches === true,
      lang: navigator.language?.slice(0, 20) ?? null,
    };
  } catch { return null; }
}

export default function AskClient({
  initial,
  task,
  prefill,
}: {
  /** 저장된 대화를 열고 들어올 때. 없으면 새 대화다. */
  initial?: { id: string; turns: Turn[] } | null;
  /** 과제 안에서 열었을 때. 여기서 시작한 대화는 그 과제에 들어간다. */
  task?: { id: string; title: string } | null;
  /** 226회차: 폰에서 글을 긁어 로키로 넘겼을 때 그 글. 입력칸에 미리 담아 두고 보낼지는 사람이 정한다. */
  prefill?: string | null;
} = {}) {
  // 이 파일은 `t` 가 대화 한 턴(map 의 t)이라 번역은 `tr` 로 받는다.
  const tr = useT(ROOKERY);
  /** 익명일 때 남은 횟수. 로그인 상태면 null 이라 아무것도 안 보인다. */
  const [turnsLeft, setTurnsLeft] = useState<number | null>(null);
  /** 이어서 저장할 대화. 새 대화면 null 이고 첫 턴 뒤에 서버가 채워 준다. */
  const [conversationId, setConversationId] = useState<string | null>(
    initial?.id ?? null,
  );
  /** 이번 턴에 붙일 사진. 보내면 비운다. */
  const [attached, setAttached] = useState<{ name: string; b64: string }[]>([]);
  const [turns, setTurns] = useState<Turn[]>(initial?.turns ?? []);
  /**
   * 화면 보기 고리가 **지금까지 오간 말**을 읽는 자리. 상태를 바로 보면 고리가 매번 새로 걸려
   * 20초 자가 다시 시작된다 — 그러면 영영 안 들여다본다. 그래서 ref 로 흘려 둔다.
   */
  const turnsRef = useRef<Turn[]>(initial?.turns ?? []);
  useEffect(() => { turnsRef.current = turns; }, [turns]);
  const [text, setText] = useState(prefill ?? "");
  // 넘겨받은 글은 주소에서 지운다 — 안 지우면 새로고침할 때마다 같은 글이 다시 담긴다.
  useEffect(() => {
    if (prefill && typeof window !== "undefined" && window.location.search.includes("q=")) {
      const u = new URL(window.location.href);
      u.searchParams.delete("q");
      window.history.replaceState(null, "", u.pathname + (u.search || "") + u.hash);
    }
  }, [prefill]);
  const [busy, setBusy] = useState(false);
  /** 지금 뒤에서 무엇을 하는 중인지. 답이 오면 비운다. */
  const [doing, setDoing] = useState<string | null>(null);
  /** 아직 안 끝난 일이 어느 단계인지(업무 id → "Dev: 코드를 쓰는 중"). */
  const [steps, setSteps] = useState<Record<string, string>>({});
  // 177회차 사장님 "이거 진행하는지 잘 모르겠어, 애니메이션 추가해": 일이 도는 동안 몇 분째인지 세고 막대를 움직인다.
  const [startedAt, setStartedAt] = useState<Record<string, string>>({});
  const [, setClock] = useState(0);
  useEffect(() => {
    if (!Object.keys(steps).length) return;
    const id = setInterval(() => setClock((c) => c + 1), 30_000);
    return () => clearInterval(id);
  }, [steps]);
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
          steps?: { assignmentId: string; who: string; step: string; plan?: PlanCard; startedAt?: string }[];
        };
        if (!alive) return;
        sinceRef.current = new Date().toISOString();
        setSteps(Object.fromEntries((data.steps ?? []).map((x) => [x.assignmentId, `${x.who}: ${x.step}`])));
        setStartedAt(Object.fromEntries((data.steps ?? []).filter((x) => x.startedAt).map((x) => [x.assignmentId, x.startedAt!])));
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
          // 188회차: 대화 전체(455턴·10MB)를 매번 보내고 있었다. 서버는 어차피 턴당 3천 자·전체 6만 자만 읽는다(clipTranscript).
          messages: history.slice(-30).map((t) => ({ role: t.role, content: t.content.length > 3000 ? t.content.slice(0, 3000) + " …(잘림)" : t.content })), // i18n-skip (서버 결과 모양·모델에 주는 글)
          visitor: visitorId(),
          conversationId,
          taskId: task?.id ?? null,
          images: attached.map((a) => a.b64),
          device: deviceFacts(),
        }),
      });

      if (!res.body) {
        setTurns([...history, { role: "assistant", content: tr("답이 오지 않았습니다.") }]);
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
              { role: "assistant", content: String(event.error ?? tr("문제가 생겼습니다.")) },
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
              files?: Turn["files"];
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
                files: data.files ?? null,
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
          { role: "assistant", content: tr("답이 끊겼습니다. 다시 보내 주십시오.") },
        ]);
      }
    } catch {
      setTurns([...history, { role: "assistant", content: tr("연결이 끊겼습니다.") }]);
    } finally {
      setBusy(false);
      setDoing(null);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end" }));
    }
  }

  const last = turns[turns.length - 1];

  /**
   * **시연 모드**(?시연=1). 조용함 → 대화 중 → 일하는 중을 저절로 돈다.
   * 진짜 업무를 돌리면 돈이 들고 몇 분이 걸린다 — 영상 한 편 찍자고 그럴 일이 아니다.
   * 이건 **보여 주기 위한 가짜**라 주소에 적지 않으면 절대 안 켜진다.
   */
  const [시연, set시연] = useState<0 | 1 | 2>(0);
  useEffect(() => {
    try { if (new URLSearchParams(window.location.search).get("시연") !== "1") return; } catch { return; }
    const 차례: (0 | 1 | 2)[] = [0, 1, 2, 2, 2];
    let i = 0;
    const 자 = setInterval(() => { i = (i + 1) % 차례.length; set시연(차례[i]); }, 2600);
    return () => clearInterval(자);
  }, []);
  // ── 대화 중인가 일하는 중인가 (228회차, 사장님 "대화하고 있는지 개발하는지 구분해야 하고")
  // 답을 기다리는 몇 초와 뒤에서 몇 분째 코드를 쓰는 것이 같은 얼굴이면 안 된다.
  const 도는일 = Object.entries(steps);
  const 모드 = 시연 ? (시연 === 1 ? "대화중" : "일하는중") : 모드계산(busy, 도는일.length);
  // 켜 두고 쓰는 좁은 창(메신저처럼). 미리보기 칸은 접는다 — 좁은 데서 반을 떼면 대화가 죽는다.
  const { 좁게, 바꾸기: 창바꾸기 } = use좁은창();
  // 보고 고르시라고 만든 세 결(?결=2, ?결=3). 고르시면 그것만 남기고 나머지는 지운다.
  const 결 = use결();
  // **로키가 화면을 보고 있다가 말을 건다.** 사장님이 한 번 눌러야 켜지고, 켜져 있는 동안 늘 보인다.
  const 화면 = use화면보기(
    useCallback((말: string) => setTurns((t) => [...t, { role: "assistant", content: 말, 먼저건말: true }]), []),
    useCallback(() => turnsRef.current.slice(-4).map((t) => `${t.role === "user" ? "사장님" : "로키"}: ${t.content.slice(0, 160)}`), []), // i18n-skip (서버 결과 모양·모델에 주는 글)
    tr,
  );
  const 방금들어감 = use방금들어감(모드);
  const 하는일 = 도는일.length ? 도는일.map(([, v]) => v).join(" · ") : null;
  const 몇분 = (() => {
    const 시작들 = 도는일.map(([id]) => startedAt[id]).filter(Boolean);
    if (!시작들.length) return null;
    const 가장이른 = Math.min(...시작들.map((t) => new Date(t).getTime()));
    return Math.max(0, Math.round((Date.now() - 가장이른) / 60_000));
  })();

  return (
    <>
    <전환 보임={방금들어감} />
    {/*
      위쪽 여백은 장식이 아니다. 좌우 모서리에 설정과 과제 버튼이 떠 있어서,
      이만큼 내리지 않으면 첫 줄이 버튼 밑에 깔린다.
      `pixel` 은 globals.css 에 있다 — 폰트·종이색·픽셀 보간을 한 번에 켠다.
      이 화면에만 붙인다: 대시보드는 표가 빽빽해서 픽셀 폰트가 오히려 나쁘다.

      10-02: 이 넷은 원래 두 빗금 줄이었다. 그때는 `return (` 바로 다음이라 **자바스크립트 주석**이었는데,
      위에 조각(`<>`)을 넣자 **JSX 안의 글자**가 되어 화면 맨 위에 그대로 찍혔다.
      JSX 안에서는 중괄호로 감싼 블록 주석이어야 한다 — 같은 글이 자리에 따라 주석도 되고 글자도 된다.
      그리고 그 블록 주석 안에는 닫는 표시를 글로 쓰면 안 된다 — 거기서 주석이 끊긴다(방금 그래서 한 번 깨졌다).
    */}
    {/*
      10-09 사장님 "입력 상자 내리라고". 상자 키를 화면보다 4rem 짧게 잡아 뒀더니
      그 4rem 이 **입력칸 아래 빈 띠**로 남아 있었다. 화면 키를 다 쓰고 바닥 여백만 조금 둔다.
      `dvh` 인 이유: 폰은 주소창이 접히면서 `vh` 가 실제 화면보다 커진다 — 그만큼 또 밀려 내려간다.
    */}
    <div className={`pixel mx-auto flex flex-col ${좁게 ? "h-[100dvh] max-w-[420px] px-3 pb-2 pt-3" : "h-[100dvh] max-w-2xl px-4 pb-2 pt-9 lg:max-w-[1180px] lg:flex-row lg:gap-6"}${모드 === "일하는중" ? " rk-일판" : ""}`}>
    <div className={`flex h-full min-h-0 min-w-0 flex-1 flex-col${좁게 ? "" : " lg:max-w-2xl"}`}>
      {task && (
        <p className="pt-2 text-center text-xs text-[var(--rk-400)]">
          {tr("과제 · {title}", { title: task.title })}
        </p>
      )}
      {turnsLeft !== null && (
        <p className="pt-2 text-center text-xs text-[var(--rk-400)]">
          {tr("로그인 없이 {n}번 더 쓸 수 있습니다 ·", { n: turnsLeft })}{" "}
          <a className="underline" href="/login">
            {tr("로그인")}
          </a>
          {tr("하면 제한 없이, 대화도 저장됩니다.")}
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
        "판단이 N건 계획한 자리 밖에서 돌았습니다" 줄은 09-17 사장님 지시로 대화 화면에서 뺐다 —
        운영 신호지 쓰는 사람이 볼 말이 아니다. 신호는 그대로 남아 있다: `/api/routing/health`,
        `RoutingNotice.tsx`(안 붙였을 뿐), 자가진단(`selfcheck.mts` 7번 줄).
      */}

      {/*
        **로키가 앞에 나와 있다.** 두근도트처럼 얼굴이 먼저고 말이 그 아래로 흐른다.
        조용할 때는 아무것도 안 보인다 — 할 일 없는데 서 있으면 장식이고, 장식은 제일 먼저 지겨워진다(08-31).
      */}
      {결 === 2 && <큰얼굴 t={tr} 모드={모드} 하는일={하는일 ?? (시연 ? "Dev: 코드를 쓰는 중" : null)} 몇분={몇분 ?? (시연 === 2 ? 7 : null)} />}
      {/*
        **처음 화면에서는 안 보인다**(228회차 10-03). 맨 윗줄 제일 좋은 자리를
        좁게·창으로 띄우기·화면 보여주기가 먹고 있었다 — 처음 온 사람에게 필요 없고,
        "화면 보여주기" 는 무섭기까지 하다. 한 번 주고받은 뒤에 나온다.
      */}
      {turns.length > 0 && (
      <div className="flex items-center gap-3 pb-1">
        {결 !== 2 && 모드 !== "조용함" && <로키얼굴 모드={모드} />}
        <div className="min-w-0 flex-1">
          {결 !== 2 && 모드 !== "조용함" && (
            <모드띠 t={tr} 모드={모드} 하는일={하는일 ?? (시연 === 2 ? "Dev: 코드를 쓰는 중" : null)} 몇분={몇분 ?? (시연 === 2 ? 7 : null)} />
          )}
        </div>
        <창단추 t={tr} 좁게={좁게} 바꾸기={창바꾸기} />
      </div>
      )}
      {turns.length > 0 && (
      <div className="pb-2">
        <화면보기띠 {...화면} />
      </div>
      )}

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
                ? tr("\"{title}\" 안에서 나눈 이야기만 여기 모입니다.", { title: task.title })
                : tr("무엇이든 물어보세요. 찾아봐야 할 것은 찾아보고, 시간이 드는 일은 AI가 업무로 맡아 자동으로 만들어요.")}
            </p>
            {/*
              **예시 셋**(228회차 10-03). 처음 쓰는 사람으로 들어가 재 보니 예시가 0개였다 —
              "무엇이든 물어보세요" 만 있고 뭘 물을지 보기가 없으면 사람은 거기서 멈춘다.
            */}
            {!task && <예시 t={tr} 넣기={(글) => { setText(글); requestAnimationFrame(() => inputRef.current?.focus()); }} />}
            {/* 100회차: Paddle 판매자 심사는 첫 화면에서 약관·개인정보·환불로 가는 길을 본다(루트 / 가 여기로 온다). */}
            {!task && (
              <p className="text-[11px] text-[var(--rk-400)]">
                <a href="/pricing" className="underline">{tr("요금")}</a>
                <span className="mx-1.5">·</span>
                <a href="/terms" className="underline">{tr("이용약관")}</a>
                <span className="mx-1.5">·</span>
                <a href="/refund" className="underline">{tr("환불 정책")}</a>
                <span className="mx-1.5">·</span>
                <a href="/privacy" className="underline">{tr("개인정보 처리방침")}</a>
              </p>
            )}
            {/*
              100회차: Paddle 심사가 "사람을 붙여"를 번역기로 읽고 사람 용역으로 보고 거절했다(09-13).
              소프트웨어라는 것을 영어로도 적는다. 다만 **맨 아래**다 — 10-03 에 재 보니 한국 사람이 보는
              첫 화면 둘째 줄에 영어 178자가 있었다. 심사에 필요한 글이지 처음 온 사람에게 할 말이 아니다.
            */}
            {!task && (
              <p className="text-[10px] leading-relaxed text-[var(--rk-400)] opacity-70">Rookery is AI software (SaaS). All results are generated automatically by AI models and delivered digitally in the app. We do not sell physical goods or human-performed services.</p>
            )}
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={t.role === "user" ? "text-right" : ""}>
            <div
              className={
                "inline-block max-w-[85%] rounded-2xl border-2 border-[var(--rk-ink)] px-4 py-2.5 text-sm " +
                (t.role === "user" ? "whitespace-pre-wrap " : "") +
                (t.role === "user"
                  ? "bg-[var(--rk-ink)] text-[var(--rk-paper)]"
                  : "bg-[var(--rk-100)] text-[var(--rk-ink)]") +
                // 시킨 일의 결과는 답이 아니라 **돌아온 것**이다. 왼쪽 띠 하나로
                // 가른다 — 같은 회색 상자면 "누가 언제 한 말인지" 를 읽어야 안다.
                (t.returnedWork ? " border-l-8 border-l-[#E0703A]" : "") +
                // **로키가 화면을 보고 먼저 건 말**은 답이 아니다. 물어보지도 않았는데 온 말이라
                // 같은 상자면 "내가 뭘 물었더라" 를 되짚게 된다. 파란 띠로 가른다.
                (t.먼저건말 ? " rk-먼저" : "")
              }
            >
              {t.먼저건말 && <div className="rk-먼저-딱지">{tr("화면을 보고")}</div>}
              {/* 188회차: 옛 결과 턴엔 파일 전문이 본문에 실려 있다(새 결과는 목록만). 그리는 쪽에서 "## 파일" 아래를 자른다 — 파일은 아래 열기·저장으로. */}
              {t.role === "assistant" ? <ChatMarkdown>{t.returnedWork ? stripFileBodies(t.content) : t.content}</ChatMarkdown> : t.content}
            </div>
            {t.role === "assistant" && (
              // 100회차: 구글 플레이 AI 생성 콘텐츠 정책 — 앱을 나가지 않고 AI 결과를 신고할 수 있어야 한다.
              // 두근도트와 같은 방식(메일 앱으로, 무엇을 신고하는지 미리 채워서). 표를 새로 만들지 않았다.
              <a
                href={`mailto:az51826295@gmail.com?subject=${encodeURIComponent(tr("로키 신고: AI 답변"))}&body=${encodeURIComponent(tr("대화: {id}\n답변 앞부분: {head}\n\n무엇이 문제인지 적어 주세요:\n", { id: conversationId ?? tr("(저장 전)"), head: t.content.slice(0, 200) }))}`}
                className="mt-0.5 block text-[10.5px] text-[var(--rk-400)] hover:text-[var(--rk-ink)]"
              >
                {tr("신고")}
              </a>
            )}
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
                        {tr("받기")}
                      </a>
                    ) : (
                      <>
                        <button type="button" className="underline" onClick={() => openFile(f)}>
                          {tr("열기")}
                        </button>
                        <button type="button" className="underline" onClick={() => saveFile(f)}>
                          {tr("저장")}
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
                      "rounded-full border-2 px-3 py-1 text-xs disabled:opacity-40 " +
                      (b.label === "시작" || b.label === tr("시작")
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
                {tr("{name} 고용 — {why}", { name: t.hired.name, why: t.hired.why })}
              </p>
            )}
            {t.assignment && (
              <div className="mt-1.5 text-xs text-[var(--rk-400)]">
                <p>
                  {tr("작업 시작 · {title}", { title: t.assignment.title })}
                  {t.assignment.queued && !steps[t.assignment.id] && !t.assignment.returned ? tr(" (차례 기다리는 중)") : ""}
                  {t.assignment.returned
                    ? tr(" — 작업 완료")
                    : steps[t.assignment.id]
                      ? ` — ${steps[t.assignment.id]}…`
                      : tr(" — 끝나면 여기 붙어요")}
                </p>
                {!t.assignment.returned && steps[t.assignment.id] && (
                  <p className="mt-1 flex items-center gap-2" aria-live="polite">
                    <span className="rk-progress" aria-hidden="true"><span /></span>
                    <span>
                      {startedAt[t.assignment.id]
                        ? tr("{n}분째", { n: Math.max(0, Math.round((Date.now() - new Date(startedAt[t.assignment.id]).getTime()) / 60_000)) })
                        : tr("돌아가는 중")}
                    </span>
                  </p>
                )}
              </div>
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
                {tr("찾아본 것: {list}", { list: t.searched.join(" · ") })}
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
                {tr("{name} 은(는) 아직 교육 전입니다 — 끝나야 일을 받을 수 있습니다.", { name: t.needsOnboarding.name })}
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
              className="rounded-full border border-[var(--rk-400)] px-4 py-1.5 text-sm hover:bg-[var(--rk-100)]"
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
                className="h-16 w-16 rounded-xl border border-[var(--rk-200)] object-cover"
              />
              <button
                onClick={() =>
                  setAttached((prev) => prev.filter((_, k) => k !== i))
                }
                aria-label={tr("빼기")}
                className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full bg-[var(--rk-ink)] text-xs text-[var(--rk-paper)]"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {conversationId && <PreviewStrip summary={previewSummary(preview.data, steps, tr)} onOpen={() => setPreviewOpen(true)} />}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
        /* 10-09 사장님 "말하는 거 아래쪽은 사진 바탕으로해" — 칸 세 개가 각각
           각진 상자로 떠 있던 것을 둥근 상자 하나로 묶는다. 글 칸이 위,
           동그란 단추들이 그 아래. 테두리가 상자 하나뿐이라 눈이 덜 바쁘다. */
        className="mt-2 rounded-[26px] border border-[var(--rk-200)] bg-[var(--rk-100)] px-3 py-2"
      >
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={tr("무엇이든 물어보세요")}
          className="w-full bg-transparent px-2 py-2.5 text-sm text-[var(--rk-ink)] outline-none placeholder:text-[var(--rk-400)]"
        />
        <div className="flex items-center gap-2">
          <label
            aria-label={tr("그림 붙이기")}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--rk-200)] bg-[var(--rk-paper)] text-[var(--rk-ink)] hover:bg-[var(--rk-200)]"
          >
            <Icon name="attach" size={18} />
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
          <div className="min-w-0 flex-1" />
          <button
            aria-label={tr("보내기")}
            title={tr("보내기")}
            disabled={busy || !text.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--rk-ink)] text-[var(--rk-paper)] disabled:opacity-30"
          >
            <Icon name="send" size={18} />
          </button>
        </div>
      </form>
    </div>
    {!좁게 && <PreviewPanel
      conversationId={conversationId}
      preview={preview}
      steps={steps}
      plans={plans}
      open={previewOpen}
      onOpenChange={setPreviewOpen}
      onReverted={() => { setPanelKey((k) => k + 1); }}
      onFix={(feedback) => { setPreviewOpen(false); void send(tr("수정 요청: {feedback}", { feedback })); }}
    />}
    </div>
    </>
  );
}
