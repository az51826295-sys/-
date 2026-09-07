/**
 * 일의 종류.
 *
 * 09-06 사장님: "게임 먼저 하는데, 과제·게임·유튜브 영상·분석 등 하는 거니까 지금 당장 못 해도
 * 구조는 만들어 놔." 로키는 "뭐든 다 하는 회사" 다. 그래서 화면(현재 판)과 판 배관은 게임을
 * 몰라야 한다 — 종류마다 **무엇이 증거인가**만 다르다.
 *
 * - 게임: 유니티가 찍은 사진 셋(화면·얼굴·걷기)과 판정표.
 * - 자산(3D·2D): 썸네일과 콘셉트, 판정(PASS/FAIL).
 * - 영상(아직 직원 없음): 썸네일, 첫 5초, 길이·소리 검사.
 * - 분석·문서(아직): 본문과 출처.
 *
 * 직원을 붙이는 것은 `skills/registry.ts` 한 줄이고, 종류를 붙이는 것은 여기 한 줄이다.
 * 둘 다 엔진이나 화면에 분기를 더하지 않는다.
 */

export type WorkFamily = "game" | "asset" | "video" | "analysis" | "document";

export type ProofFile = { id: string; title: string; storage_path: string; mime_type: string };

export type WorkKind = {
  /** deliverables.deliverable_type */
  type: string;
  family: WorkFamily;
  label: string;
  /** 증거 사진의 차례. 저장 경로에 이 낱말이 든 파일이 그 자리에 간다(같은 이름이 여럿이면 최신). */
  proofOrder: string[];
  /** 자(판정)의 이름. 화면이 "무엇으로 쟀나" 를 적을 때 쓴다. */
  ruler: string;
  /** 아직 이 종류를 만드는 직원이 없으면 무엇이 필요한지. 화면은 이 줄을 그대로 보여 준다. */
  notYet?: string;
};

export const WORK_KINDS: Record<string, WorkKind> = {
  app_build: {
    type: "app_build", family: "game", label: "게임(유니티)",
    proofOrder: ["unity-screenshot", "unity-map", "unity-portrait", "unity-walk", "unity-jump"],
    ruler: "유니티 합격 시험(RookeryAcceptance)",
  },
  mesh_assets: {
    type: "mesh_assets", family: "asset", label: "3D 자산",
    proofOrder: ["thumbnail", "concept_front", "concept_face"],
    ruler: "메시 판정(judge-bench 규격 v1)",
  },
  game_assets: {
    type: "game_assets", family: "asset", label: "2D 그림",
    proofOrder: ["preview", "sprite", "sheet"],
    ruler: "그림 판정",
  },
  art_bible: { type: "art_bible", family: "document", label: "아트 바이블", proofOrder: [], ruler: "없음(사람이 읽는다)" },
  market_research: { type: "market_research", family: "analysis", label: "시장 조사", proofOrder: [], ruler: "출처 검사" },
  lead_research: { type: "lead_research", family: "analysis", label: "리드 조사", proofOrder: [], ruler: "출처 검사" },
  // ── 아직 직원이 없는 종류. 구조만 먼저 둔다(09-06). ──
  video: {
    type: "video", family: "video", label: "영상(유튜브)",
    proofOrder: ["thumbnail", "first5s", "mid"],
    ruler: "영상 검사(길이·소리 끊김·자막 일치·첫 5초)",
    notYet: "직원 없음 — 필요한 것: 대본(지금 모델) · 목소리(TTS) · 화면(영상 생성 또는 그림+ffmpeg) · 자.",
  },
  analysis: {
    type: "analysis", family: "analysis", label: "분석(자료·영상)",
    proofOrder: [],
    ruler: "출처 자(인용이 원문에 있는가 · 시각이 길이 안인가)",
  },
};

/** 종류를 모르는 산출물도 화면이 죽지 않게 — 증거 없음, 자 없음으로 그린다. */
export function kindOf(type: string | null | undefined): WorkKind {
  return (type && WORK_KINDS[type]) || { type: type ?? "unknown", family: "document", label: type ?? "산출물", proofOrder: [], ruler: "없음" };
}

/** 이 산출물의 증거 사진들(종류의 차례대로, 같은 자리는 최신 것). 나머지 파일은 `rest`. */
export function proofOf(type: string | null | undefined, files: ProofFile[]): { photos: ProofFile[]; rest: ProofFile[] } {
  const kind = kindOf(type);
  const used = new Set<string>();
  const photos: ProofFile[] = [];
  for (const key of kind.proofOrder) {
    const hit = [...files].reverse().find((f) => f.storage_path.includes(key) && f.mime_type.startsWith("image/"));
    if (hit && !used.has(hit.id)) { photos.push(hit); used.add(hit.id); }
  }
  // 같은 자리의 옛 사진(지난 시험의 unity-screenshot 등)은 목록에서도 뺀다 — 파일 목록은 산출물이지 사진첩이 아니다.
  const rest = files.filter((f) => !used.has(f.id) && !kind.proofOrder.some((k) => f.storage_path.includes(k) && f.mime_type.startsWith("image/")));
  return { photos, rest };
}
