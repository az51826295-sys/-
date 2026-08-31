import { notFound } from "next/navigation";
import { UnityStripView, type Live } from "@/app/dashboard/chat/UnityStrip";

/** 옆 칸으로 볼 것인가, 얹힌 띠로 볼 것인가. 둘 다 눈으로 대 봐야 한다. */
// 실제로 쓰는 화면(`/ask`)이 띠를 쓴다. 기본값을 그쪽에 맞춘다 —
// 미리보기가 안 쓰는 모양만 보여 주면, 보고도 못 잡는다.
const AS_PANEL = false;

/**
 * 유니티 띠를 **눈으로 대 보는 자리.**
 *
 * 이 띠는 십 분짜리 세션이 도는 동안에만 나타난다. 그 순간을 기다려서 색과
 * 단계를 고칠 수는 없고, 막힌 판이나 오류가 쏟아진 판은 일부러 만들기도 어렵다.
 * 그래서 상태를 손으로 만들어 나란히 세워 놓고 본다.
 *
 * 개발 중에만 열린다. 판정에 쓰이는 화면이 아니라 **화면을 고치려고 보는
 * 화면**이라, 배포된 곳에 있으면 언젠가 이것을 진짜 상태로 읽는 사람이 나온다.
 */

const now = Date.now();
const ago = (sec: number) => new Date(now - sec * 1000).toISOString();

const CASES: { label: string; note: string; live: Live }[] = [
  {
    label: "그리는 중",
    note: "설계는 끝났고 아티스트가 스프라이트를 한 장씩 그리고 있다.",
    live: {
      runnerSeenAt: ago(8),
      runnerMeasurable: true,
      session: {
        id: "1",
        want: "2D 픽셀 점프 게임 — 발판 세 개와 코인",
        scope: "Assets/Rookery/",
        status: "running",
        round: 2,
        endedWhy: null,
        sceneMethod: "Rookery.Editor.SceneBuilder.Build",
        criteriaCount: 4,
        planned: 6,
        written: 4,
        sprites: 3,
        drawn: 1,
        startedAt: ago(214),
        updatedAt: ago(8),
        rounds: [
          { round: 2, files: 2, errors: [], note: "플레이어 이동과 카메라를 냈다.", at: ago(40) },
          { round: 1, files: 2, errors: [], note: "발판과 코인을 냈다.", at: ago(150) },
        ],
      },
    },
  },
  {
    label: "고치는 중",
    note: "컴파일 오류가 돌아왔다. 심부름꾼 소식이 2분 넘게 없다.",
    live: {
      runnerSeenAt: ago(140),
      runnerMeasurable: true,
      session: {
        id: "2",
        want: "2D 픽셀 점프 게임 — 발판 세 개와 코인",
        scope: "Assets/Rookery/",
        status: "running",
        round: 3,
        endedWhy: null,
        sceneMethod: "Rookery.Editor.SceneBuilder.Build",
        criteriaCount: 4,
        planned: 6,
        written: 6,
        sprites: 3,
        drawn: 3,
        startedAt: ago(602),
        updatedAt: ago(30),
        rounds: [
          {
            round: 3,
            files: 6,
            errors: [
              {
                file: "Assets/Rookery/Editor/SceneBuilder.cs",
                line: 84,
                message: "CS0117: 'Font' does not contain a definition for 'Arial'",
              },
              {
                file: "Assets/Rookery/Player.cs",
                line: 12,
                message: "CS0246: type or namespace 'Rigidbody2D' could not be found",
              },
            ],
            note: "씬 빌더와 플레이어를 냈다.",
            at: ago(30),
          },
          { round: 2, files: 2, errors: [], note: "플레이어 이동과 카메라를 냈다.", at: ago(300) },
        ],
      },
    },
  },
  {
    label: "컴파일 통과",
    note: "기계가 잰 것은 여기까지다. 합격 기준은 사람이 켜서 본다.",
    live: {
      runnerSeenAt: ago(20),
      runnerMeasurable: true,
      session: {
        id: "3",
        want: "2D 픽셀 점프 게임 — 발판 세 개와 코인",
        scope: "Assets/Rookery/",
        status: "compiled",
        round: 4,
        endedWhy:
          "컴파일이 통과했습니다. 합격 기준은 아직 확인되지 않았습니다 — 그건 사람이 봅니다.",
        sceneMethod: "Rookery.Editor.SceneBuilder.Build",
        criteriaCount: 4,
        planned: 6,
        written: 6,
        sprites: 3,
        drawn: 3,
        startedAt: ago(866),
        updatedAt: ago(20),
        rounds: [
          { round: 4, files: 1, errors: [], note: "폰트를 LegacyRuntime.ttf 로 바꿨다.", at: ago(20) },
          { round: 3, files: 6, errors: [], note: "씬 빌더와 플레이어를 냈다.", at: ago(200) },
        ],
      },
    },
  },
  {
    label: "막힘 · 심부름꾼 안 옴",
    note: "같은 오류가 두 판 연속이라 멈췄다. 심부름꾼은 한 번도 안 왔다.",
    live: {
      runnerSeenAt: null,
      runnerMeasurable: true,
      session: {
        id: "4",
        want: "UI 씬 — 시작 버튼과 점수판",
        scope: "Assets/Rookery/",
        status: "stuck",
        round: 5,
        endedWhy:
          "지난 판과 똑같은 오류가 돌아왔습니다. 낸 수정이 아무것도 바꾸지 못했다는 뜻이라, 한 판 더 도는 것은 돈만 씁니다.",
        sceneMethod: null,
        criteriaCount: 3,
        planned: 4,
        written: 4,
        sprites: 0,
        drawn: 0,
        startedAt: ago(1500),
        updatedAt: ago(120),
        rounds: [
          {
            round: 5,
            files: 2,
            errors: [
              {
                file: "Assets/Rookery/UI/Menu.cs",
                line: 7,
                message: "CS0246: type or namespace 'Button' could not be found (com.unity.ugui 없음)",
              },
            ],
            note: "패키지가 없어서 고칠 수 없었다.",
            at: ago(120),
          },
        ],
      },
    },
  },
];

export default function UnityStripPreview() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="pixel-type min-h-screen bg-[#050505] p-8 text-white" style={{ backgroundImage: "radial-gradient(60% 60% at 20% 0%, #1a1a1a 0%, #050505 100%)", color: "#fff" }}>
      {/* 이 화면 밖(문서 바탕)까지 어둡게 둔다. 개발용 화면이라 여기서만 쓴다. */}
      <style>{"body{background:#050505}"}</style>
      <h1 className="text-lg font-semibold text-white">유니티 띠 — 상태 넷</h1>
      <p className="mt-1 max-w-2xl text-sm text-white/40">
        개발용 화면입니다. 실제 세션이 아니라 손으로 만든 상태로, 색과 단계를 눈으로 대 보려고 있습니다.
      </p>

      <div className="mt-8 space-y-10">
        {CASES.map((c) => (
          <section key={c.label}>
            <div className="mb-2 flex items-baseline gap-3">
              <h2 className="text-sm font-semibold text-white/90">{c.label}</h2>
              <p className="text-xs text-white/40">{c.note}</p>
            </div>
            {/* 대화창 안에 놓였을 때의 자리를 흉내 낸다. */}
            <div className="flex overflow-hidden border border-white/[0.15] bg-white/[0.03]">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-2.5 text-sm">
                  <span className="border border-white/20 px-2.5 py-1.5 text-sm font-medium text-white/80">
                    로키 — 접수 담당
                  </span>
                  <span className="text-xs text-white/30">available</span>
                </div>
                {!AS_PANEL && <UnityStripView live={c.live} />}
                <div className="px-4 py-16 text-center text-sm text-white/25">대화 내용</div>
              </div>
              {AS_PANEL && (
                <aside className="w-[360px] shrink-0 border-l border-white/[0.06] bg-[#08080c]">
                  <UnityStripView live={c.live} panel />
                </aside>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
