import { notFound } from "next/navigation";
import { spriteNote, type PlannedSprite } from "@/lib/unity/sprites";

/**
 * 쓰는 판이 받는 그림 쪽지를 **글자 그대로 대 보는 자리.**
 *
 * 이 쪽지는 프롬프트 안으로 들어가서 다시는 안 보인다. 틀려도 화면에 아무
 * 표시가 안 나고, 잘못된 경로를 실어 보내면 코드는 컴파일까지 통과한 다음
 * 화면만 빈다 — 우리가 여섯 번 밟은 그 자리다. 그래서 나가는 글을 여기서 본다.
 *
 * 개발 중에만 열린다.
 */

const SCOPE = "Assets/Rookery/";

const CASES: { label: string; note: string; sprites: PlannedSprite[] }[] = [
  {
    label: "그린 것과 못 그린 것이 섞였다",
    note: "실제 08-31 세션의 모양. 셋을 그렸고 판정이 갈렸다.",
    sprites: [
      {
        name: "player",
        purpose: "주인공. 정면 한 포즈",
        kind: "character",
        made: true,
        verdict: "FAIL",
        measured: { saturation: 14 },
        path: "Assets/Rookery/Sprites/player.png",
      },
      {
        name: "coin",
        purpose: "주울 수 있는 동전",
        kind: "prop",
        made: true,
        verdict: "PASS",
        measured: { contrast: 71 },
        path: "Assets/Rookery/Sprites/coin.png",
      },
      {
        name: "platform",
        purpose: "밟고 서는 발판",
        kind: "prop",
        made: true,
        verdict: "FAIL",
        measured: null,
        // 그리려다 못 그린 판. 파일이 없다.
        path: null,
      },
    ],
  },
  {
    label: "옛 줄 — `path` 칸이 생기기 전에 그린 것",
    note: "경로는 이름에서 그대로 지어졌고, 그린 판에만 `measured` 가 붙었다.",
    sprites: [
      {
        name: "player",
        purpose: "주인공",
        kind: "character",
        made: true,
        verdict: "UNDEFINED",
        measured: { bytes: 41233 },
      },
      {
        name: "spike",
        purpose: "밟으면 죽는 가시",
        kind: "prop",
        made: true,
        verdict: "FAIL",
        measured: null,
      },
    ],
  },
  {
    label: "하나도 못 그렸다",
    note: "전부 코드로 그려야 한다. 쪽지가 그렇게 말하는지 본다.",
    sprites: [
      {
        name: "player",
        purpose: "주인공",
        kind: "character",
        made: true,
        verdict: "FAIL",
        measured: null,
        path: null,
      },
    ],
  },
  {
    label: "그림이 없는 일",
    note: "설계도가 그림을 안 냈다. 쪽지가 아예 안 나가야 한다.",
    sprites: [],
  },
];

export default function SpriteNotePreview() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <h1 className="text-lg font-semibold">
        쓰는 판이 받는 그림 쪽지 — 상태별
      </h1>
      <p className="text-xs text-neutral-500">
        울타리 <code>{SCOPE}</code> 기준. 아래 글자가 그대로 프롬프트에 실린다.
      </p>
      {CASES.map((c) => {
        const text = spriteNote(SCOPE, c.sprites);
        return (
          <section key={c.label} className="space-y-2">
            <h2 className="text-sm font-semibold">{c.label}</h2>
            <p className="text-xs text-neutral-500">{c.note}</p>
            <pre className="overflow-x-auto border border-neutral-300 bg-neutral-50 p-3 text-xs whitespace-pre-wrap text-neutral-900">
              {text || "(쪽지 없음)"}
            </pre>
          </section>
        );
      })}
    </div>
  );
}
