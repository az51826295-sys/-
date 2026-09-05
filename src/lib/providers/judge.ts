/**
 * 연출가 판정 엔진에 붙는 자리.
 *
 * 자산이 설계도에 맞는지 재는 계측기는 이 저장소 밖(genesis)에 있고, HTTP 로
 * 부른다. 옮기지 않는 이유는 하나다 — **계측기가 두 벌이면 언젠가 서로 다른
 * 답을 낸다.** 그러면 어느 쪽이 맞는지 가릴 방법이 없고, 그때부터 판정은
 * 판정이 아니다.
 *
 * `art_bible` 기술은 "강제 가능한 말로 정한다"고 스스로 적어 두었는데,
 * **강제하는 쪽이 없었다.** 이 파일이 그 자리다.
 */

const BASE = process.env.JUDGE_URL ?? "http://127.0.0.1:8000";

export type CharacterVerdict = {
  verdict: "PASS" | "FAIL" | "UNDEFINED";
  fail?: string[];
  undefined?: string[];
  colors?: number;
  saturation?: number;
  luma_spread?: number;
  ground_contrast?: number;
  in_context?: { verdict: string; edge_contrast?: number; fail?: string[] };
  vs_bible?: { palette_distance?: number; shared_ramp_bands?: number };
};

export type PromptVerdict = {
  ok: boolean;
  banned: { found: string; why: string }[];
  missing: string[];
};

/** 판정기가 없으면 **판정을 지어내지 않는다.** 미측정은 실패가 아니다. */
export class JudgeUnavailable extends Error {
  constructor(cause: string) {
    super(`판정 엔진에 닿지 않는다: ${cause}`);
  }
}

async function call<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    throw new JudgeUnavailable(
      error instanceof Error ? error.message : String(error),
    );
  }
  if (!res.ok) throw new JudgeUnavailable(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** 한 후보의 방향들을 함께 낸다 — 낱장이 아니라 **세트가 판정 단위**다. */
export function judgeCharacter(
  images: string[],
  opts: { bible?: string } = {},
): Promise<CharacterVerdict> {
  return call<CharacterVerdict>("/api/judge/character", {
    images,
    bible: opts.bible ?? null,
  });
}

/**
 * 발주 문구 검사. 보내기 **전에** 부른다.
 *
 * 금지 목록은 실측으로 확인된 함정이다 — `no harsh contrast` 를 보냈더니
 * 명암폭이 172에서 36으로 무너졌고, `low saturation` 은 채도 3짜리 흑백을
 * 낳았다. 속성을 낮추라고만 하면 0이 온다.
 */
export function judgePrompt(text: string): Promise<PromptVerdict> {
  return call<PromptVerdict>("/api/judge/prompt", { text });
}


/** 3D 메시 판정 결과 — `engine/docs/asset-3d-intake-v0-design.md` 의 표. */
export type MeshVerdict = {
  verdict: "PASS" | "FAIL" | "UNDEFINED";
  rules: { id: string; verdict: "PASS" | "FAIL" | "UNDEFINED"; measured: unknown; why: string }[];
  measured: Record<string, unknown>;
  thresholds: Record<string, unknown>;
};

/**
 * GLB 하나를 잰다. 링크(생성기의 서명 링크)나 base64 로. 거르기만 한다.
 * 리깅을 요청한 일이면 `wantRig` — 그래야 본 규칙(B1)이 종합에 들어간다.
 */
export function judgeMesh(
  input: { glbUrl?: string | null; glbBase64?: string | null },
  opts: { wantRig?: boolean; profile?: "character" | "prop" } = {},
): Promise<MeshVerdict> {
  return call<MeshVerdict>("/api/judge/mesh", {
    glb_url: input.glbUrl ?? null,
    glb_base64: input.glbBase64 ?? null,
    want_rig: opts.wantRig ?? false,
    // 규격 v1: character / prop. 모르면 character(더 엄격한 쪽).
    profile: opts.profile ?? (opts.wantRig ? "character" : "prop"),
  });
}

export type PbrMaps = {
  ok: boolean;
  error?: string;
  note?: string;
  base_color_png?: string | null;
  normal_png?: string | null;
  metallic_smoothness_png?: string | null;
  occlusion_png?: string | null;
  /** 16회차: 피부 질감 — 코드로 만든 타일 모공 노멀과 피부 마스크(알파). */
  detail_normal_png?: string | null;
  detail_mask_png?: string | null;
};

/**
 * 원본 GLB 의 PBR 맵(노멀·금속거칠기)을 유니티 묶음 PNG 로. 리깅 FBX 에는 베이스컬러
 * 하나만 오기 때문에(09-05 22:40), 같은 UV 인 원본에서 되찾아 리깅 캐릭터에 붙인다 —
 * 생성 AI 를 다시 돌리지 않고 디테일을 올리는 길.
 */
export function meshTextures(input: { glbUrl?: string | null; glbBase64?: string | null }): Promise<PbrMaps> {
  return call<PbrMaps>("/api/judge/mesh/textures", {
    glb_url: input.glbUrl ?? null,
    glb_base64: input.glbBase64 ?? null,
  });
}
