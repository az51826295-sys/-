import { notFound } from "next/navigation";
import { RoutingNoticeView, type Health } from "@/app/dashboard/ask/RoutingNotice";

/**
 * 라우팅 줄을 **눈으로 대 보는 자리.**
 *
 * 이 줄은 벤더가 죽어 있는 동안에만 나타난다. 그 순간을 기다려서 문구와 색을
 * 고칠 수는 없고, 일부러 잔액을 떨어뜨려 볼 수도 없다. 그래서 상태를 손으로
 * 만들어 세워 놓고 본다.
 *
 * 개발 중에만 열린다. 여기 있는 숫자는 전부 지어낸 것이라, 배포된 곳에 있으면
 * 언젠가 이것을 진짜 원장으로 읽는 사람이 나온다.
 */

const CASES: { label: string; note: string; health: Health | null }[] = [
  {
    label: "계획대로",
    note: "아무것도 안 그린다. 매일 보는 초록불은 곧 안 보게 된다.",
    health: { measurable: true, windowHours: 24, labelled: 12, sideways: 0, up: 0, usd: 0, models: [] },
  },
  {
    label: "옆자리 (2026-08-31 실제로 있었던 일)",
    note: "판단 벤더가 안 받아서 옆 회사가 대신 했다. 품질은 안 깎이지만 계획한 자리가 아니다.",
    health: {
      measurable: true, windowHours: 24, labelled: 12,
      sideways: 9, up: 0, usd: 0.4999, models: ["gpt-5"],
    },
  },
  {
    label: "위로 샌 것",
    note: "싼 자리가 죽어서 비싼 쪽이 대신했다. 이쪽은 돈이 새는 자리다.",
    health: {
      measurable: true, windowHours: 24, labelled: 40,
      sideways: 0, up: 31, usd: 1.2044, models: ["gpt-5", "claude-opus-5"],
    },
  },
  {
    label: "둘 다",
    note: "옆으로도 가고 위로도 샜다. 한 줄에 둘이 같이 들어가는지 본다.",
    health: {
      measurable: true, windowHours: 24, labelled: 52,
      sideways: 9, up: 31, usd: 1.7043, models: ["gpt-5", "claude-opus-5"],
    },
  },
  {
    label: "못 잰다",
    note: "원장에 칸이 없다. 이때 조용히 사라지면 '이상 없음'으로 읽힌다.",
    health: { measurable: false },
  },
];

export default function RoutingNoticePreview() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-10">
      <h1 className="text-lg font-semibold">라우팅 줄 — 상태별</h1>
      {CASES.map((c) => (
        <section key={c.label} className="space-y-2">
          <h2 className="text-sm font-semibold">{c.label}</h2>
          <p className="text-xs text-neutral-500">{c.note}</p>
          <div className="border border-dashed border-neutral-300">
            <RoutingNoticeView health={c.health} />
          </div>
        </section>
      ))}
    </div>
  );
}
