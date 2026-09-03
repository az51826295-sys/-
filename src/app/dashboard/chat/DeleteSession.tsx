"use client";

import { useState } from "react";

/**
 * 판을 지우는 자리.
 *
 * 09-03 사장님: "하고 있는 작업 삭제는 왜 안돼." 막아 둔 것이 아니라 없었다.
 *
 * ## 두 번 누르게 한다
 *
 * 지우는 것은 되돌릴 수 없다. 한 번에 지워지면 손이 미끄러진 것과 지우려던
 * 것을 구분할 수 없다. 그래서 한 번은 묻고, 그 물음에 **무엇이 지워지고 무엇이
 * 안 지워지는지**를 같이 적는다.
 *
 * ## 파일이 남는다는 것을 숨기지 않는다
 *
 * 서버는 사장님 PC 를 못 연다. 그래서 지워지는 것은 판의 기록뿐이고, 유니티
 * 프로젝트에 쓰인 `.cs` 파일은 그대로 있다. 그 사실을 안 적으면 "지웠는데 왜
 * 남아 있냐" 가 되고, 그때부터는 이 화면의 말을 못 믿게 된다.
 *
 * 되돌리는 명령을 같이 보여 준다 — 지운 뒤에 알려 주면 이미 늦다.
 */
export function DeleteSession({
  sessionId,
  running,
  onDeleted,
}: {
  sessionId: string;
  running: boolean;
  onDeleted: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setTrouble(null);
    try {
      const res = await fetch(
        `/api/unity/session?id=${encodeURIComponent(sessionId)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) {
        setTrouble(data?.error ?? "지우지 못했습니다.");
        return;
      }
      onDeleted();
    } catch (e) {
      setTrouble(e instanceof Error ? e.message : "지우지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="text-[11px] text-white/30 underline underline-offset-2 hover:text-white/60"
      >
        이 판 지우기
      </button>
    );
  }

  return (
    <div className="space-y-1.5 border border-white/20 px-3 py-2">
      <p className="text-[12px] leading-relaxed text-white/80">
        {running ? (
          <>
            <strong>돌고 있는 판입니다.</strong> 지우면 심부름꾼이 다음에 물으러
            왔을 때 멈춥니다.
          </>
        ) : (
          <strong>이 판의 기록을 지웁니다.</strong>
        )}
      </p>
      {/* 안 지워지는 것을 먼저 적는다. 지운 범위를 사람이 알아야 한다. */}
      <p className="text-[11px] leading-relaxed text-white/45">
        유니티 프로젝트에 쓰인 파일은 <strong className="text-white/70">안 지워집니다</strong> —
        로키는 이 컴퓨터를 못 엽니다. 파일까지 되돌리려면 지운 뒤에 아래를
        터미널에서 돌리십시오.
      </p>
      {/* 문자열을 한 덩어리로 만든다. JSX 안에 값과 글자를 섞어 놓으면
          그 사이 띄어쓰기가 사라져서(`--undo 3--project`) 그대로 복사해도
          안 돈다. 복사해서 쓰라고 내놓는 명령이 안 돌면 없느니만 못하다. */}
      <code className="block overflow-x-auto whitespace-pre bg-black/40 px-2 py-1 text-[11px] text-white/60">
        {`python tools/unity_runner.py --undo ${sessionId} --project "<프로젝트>"`}
      </code>
      <div className="flex gap-2 pt-0.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => void remove()}
          className="border border-white/30 px-3 py-1 text-[12px] text-white/90 hover:bg-white/[0.10] disabled:opacity-50"
        >
          지웁니다
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setAsking(false)}
          className="px-3 py-1 text-[12px] text-white/50 hover:text-white/80 disabled:opacity-50"
        >
          그만두기
        </button>
      </div>
      {trouble && (
        <p className="text-[11px] leading-relaxed text-amber-200/80">{trouble}</p>
      )}
    </div>
  );
}
