import { Waiting } from "@/components/Waiting";

/**
 * 기다리는 표시를 **눈으로 대 보는 자리.**
 *
 * 서버 없이 열린다. 단계 글자가 있을 때와 없을 때, 그리고 오래 걸릴 때가
 * 어떻게 보이는지 한 화면에 놓는다 — 셋을 상상해서 정하면 그건 그려 본 것이
 * 아니다. `dev/unity-strip` 과 같은 자리다.
 */
export default function Page() {
  return (
    <main className="min-h-screen bg-neutral-950 p-10 text-white">
      <h1 className="mb-1 text-lg">기다리는 표시</h1>
      <p className="mb-8 text-sm text-white/40">
        초는 진짜로 흐릅니다. 15초가 지나면 한 줄이 더 붙습니다.
      </p>

      <div className="space-y-8">
        <section>
          <div className="mb-2 text-xs text-white/35">단계를 모를 때 (대화창)</div>
          <Waiting className="text-neutral-400" />
        </section>

        <section>
          <div className="mb-2 text-xs text-white/35">서버가 단계를 줄 때 (물어보기)</div>
          <Waiting stage="회사가 아는 것을 찾는 중" className="text-[var(--rk-400)]" />
        </section>

        <section>
          <div className="mb-2 text-xs text-white/35">단계가 긴 문장일 때</div>
          <Waiting
            stage="유니티가 컴파일하고 씬을 짓는 중"
            className="text-neutral-400"
          />
        </section>
      </div>
    </main>
  );
}
