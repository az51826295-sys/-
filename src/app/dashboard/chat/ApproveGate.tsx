"use client";

import { useState } from "react";

/**
 * 프로토타입을 **사람이 봤다**고 적는 자리.
 *
 * 09-01 순서: 설계 → 프로토타입(도형) → **사람이 본다 → 승인** → 그림을 넣는다.
 * 그 "승인" 이 여태 아무 데도 안 남았다. 사장님이 켜 보고 좋다고 하셔도 그 말이
 * 기록되지 않으니, 그림 발주가 무엇을 근거로 열리는지 말할 수 없었다.
 *
 * ## 이 버튼이 하지 않는 말
 *
 * **"합격했습니다" 가 아니다.** 위의 "합격 기준 N개는 아직 확인되지 않았습니다"
 * 는 도장을 찍어도 그대로 남는다. 기계가 잰 것(컴파일·PlayMode·기준 표)과
 * 사람이 본 것은 서로 다른 것이라, 한쪽이 다른 쪽을 덮지 않는다.
 *
 * 둘을 겹치면 "승인했으니 다 됐다" 가 되고, 그러면 **못 잰 것이 사람의 도장
 * 뒤로 숨는다.** 이 저장소가 계속 경계하는 모양이다.
 *
 * ## 반려에 이유를 받는 이유
 *
 * "아니다" 만으로는 다음 판이 아무것도 못 한다. 무엇이 아닌지 한 줄이 있으면
 * 그것이 다음 판의 입력이 된다 — 없으면 사람이 같은 것을 두 번 본다.
 */
export function ApproveGate({
  session,
}: {
  session: {
    id: string;
    humanVerdict: "approved" | "rejected" | null;
    humanNote: string | null;
    humanAt: string | null;
  };
}) {
  const [verdict, setVerdict] = useState(session.humanVerdict);
  const [note, setNote] = useState(session.humanNote ?? "");
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);

  async function send(next: "approved" | "rejected") {
    setSaving(true);
    setTrouble(null);
    try {
      const res = await fetch("/api/unity/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, verdict: next, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 저장이 안 됐는데 화면만 도장을 찍지 않는다. 그러면 근거 없이 다음
        // 문이 열린다.
        setTrouble(data?.error ?? "저장하지 못했습니다.");
        return;
      }
      setVerdict(next);
      setAsking(false);
    } catch (e) {
      setTrouble(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (verdict) {
    return (
      <div className="px-0.5 text-[12px] leading-relaxed text-white/70">
        {verdict === "approved" ? (
          <>
            <strong className="text-white/85">사장님이 보셨고 좋다고 하셨습니다.</strong>{" "}
            그림·소리는 이제 넣을 수 있습니다.
          </>
        ) : (
          <>
            <strong className="text-white/85">사장님이 보셨고 아니라고 하셨습니다.</strong>
          </>
        )}
        {note && <span className="block text-white/55">“{note}”</span>}
        <button
          type="button"
          onClick={() => {
            setVerdict(null);
            setAsking(true);
          }}
          className="mt-1 text-[11px] text-white/45 underline underline-offset-2 hover:text-white/70"
        >
          다시 정하기
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => send("approved")}
          className="border border-white/30 bg-white/[0.10] px-3 py-1.5 text-[12px] text-white/90 hover:bg-white/[0.16] disabled:opacity-50"
        >
          봤고 좋다 — 그림 넣어도 된다
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => setAsking(true)}
          className="border border-white/20 px-3 py-1.5 text-[12px] text-white/70 hover:bg-white/[0.06] disabled:opacity-50"
        >
          봤는데 아니다
        </button>
      </div>

      {asking && (
        <div className="space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="무엇이 아닌지 한 줄. 다음 판이 이걸 읽습니다."
            className="w-full resize-none border border-white/20 bg-black/30 px-2 py-1.5 text-[12px] text-white/85 outline-none placeholder:text-white/30"
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => send("rejected")}
            className="border border-white/30 px-3 py-1.5 text-[12px] text-white/85 hover:bg-white/[0.10] disabled:opacity-50"
          >
            반려로 남기기
          </button>
        </div>
      )}

      {trouble && (
        <p className="px-0.5 text-[11px] leading-relaxed text-amber-200/80">
          {trouble}
        </p>
      )}
    </div>
  );
}
