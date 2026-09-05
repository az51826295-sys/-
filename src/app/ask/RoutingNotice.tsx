"use client";

import { useEffect, useState } from "react";

/**
 * 판단이 계획한 자리에서 안 돌고 있으면 **보이게 한다.**
 *
 * 사흘 동안 몰랐던 일이 있다. Anthropic 잔액이 떨어져서 판단 등급이 전부 옆
 * 벤더로 넘어갔는데, 옆자리는 품질을 안 깎으니 아무 데도 표가 안 났다. 안전장치가
 * 설계대로 일한 것이지만, **일한 줄을 아무도 모르는 안전장치는 다음번에 그것까지
 * 죽었을 때도 아무도 모른다.**
 *
 * 평소에는 아무것도 안 그린다. 계획대로 돌 때 초록불을 켜면 매일 보게 되고, 매일
 * 보는 초록불은 안 보게 된다.
 */

const FACE = 'Galmuri11, "Galmuri14", ui-monospace, monospace';

/** 자주 물을 것이 아니다 — 이건 몇 시간 단위로 변하는 값이다. */
const POLL_MS = 5 * 60 * 1000;

export type Health = {
  measurable: boolean;
  windowHours?: number;
  labelled?: number;
  sideways?: number;
  up?: number;
  usd?: number;
  models?: string[];
};

export default function RoutingNotice() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let alive = true;
    const ask = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/routing/health");
        if (!res.ok) return;
        const body = (await res.json()) as Health;
        if (alive) setHealth(body);
      } catch {
        // 못 물어본 것은 이상이 없는 것과 다르다. 그래서 여기서 상태를 지우지
        // 않는다 — 직전에 본 것을 그대로 두고, 지어내지도 않는다.
      }
    };
    ask();
    const timer = setInterval(ask, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return <RoutingNoticeView health={health} />;
}

/**
 * 그리기만 하는 쪽. 미리보기가 손으로 만든 상태를 세워 볼 수 있게 나눠 둔다 —
 * 이 줄은 벤더가 죽었을 때만 나타나서, 그 순간을 기다려 색을 고칠 수는 없다.
 */
export function RoutingNoticeView({ health }: { health: Health | null }) {
  if (!health) return null;

  // 못 재는 경우. 조용히 사라지면 "이상 없음"으로 읽힌다.
  if (!health.measurable) {
    return (
      <Line tone="quiet">
        판단이 어느 자리에서 돌았는지 지금 못 잽니다 — 원장에 등급 칸이 없습니다
      </Line>
    );
  }

  const off = (health.sideways ?? 0) + (health.up ?? 0);
  if (!off) return null;

  const models = (health.models ?? []).join(", ");
  const usd = (health.usd ?? 0).toFixed(2);

  const kinds = [
    health.sideways ? `옆자리 ${health.sideways}` : null,
    health.up ? `위로 ${health.up}` : null,
  ].filter(Boolean);

  return (
    <Line tone="loud">
      {/* 제일 먼저 읽혀야 하는 것은 "몇 건이 계획 밖이었나" 하나다. 나머지는
          그 줄을 읽고 나서 필요한 사람만 읽으면 된다. */}
      <div>
        판단이 <b className="font-semibold">{off}건</b> 계획한 자리 밖에서
        돌았습니다 · {kinds.join(" · ")}
      </div>
      <div className="mt-1 text-white/45">
        최근 {health.windowHours}시간 · 등급 적힌 호출 {health.labelled}건 · 실제로
        일한 것은 {models || "기록 없음"} (${usd}).{" "}
        {/* `up` 은 싼 자리가 죽은 것이고 `sideways` 는 판단 벤더가 죽은 것이다.
            한 문장으로 뭉뚱그리면 어느 쪽을 보러 가야 하는지가 사라진다. */}
        {health.sideways ? "원래 벤더가" : "싼 자리가"} 왜 안 받는지는 원장에 안
        적힙니다.
      </div>
    </Line>
  );
}

function Line({
  tone,
  children,
}: {
  tone: "loud" | "quiet";
  children: React.ReactNode;
}) {
  return (
    <div className="px-3 py-2" style={{ fontFamily: FACE }}>
      <div
        className={
          "border-2 border-black px-3 py-2 text-[11px] leading-relaxed " +
          (tone === "loud"
            ? "bg-[#0b0b0b] text-white"
            : "bg-[#0b0b0b] text-white/45")
        }
      >
        {children}
      </div>
    </div>
  );
}
