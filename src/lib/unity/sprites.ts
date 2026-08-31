import { createImageProvider } from "@/lib/providers/images";
import { judgeCharacter, JudgeUnavailable } from "@/lib/providers/judge";

/**
 * 고리 안에서 그림을 만드는 자리.
 *
 * 여기가 생기기 전까지 유니티 고리는 코드만 냈다. 그래서 씬 빌더가 `Texture2D`
 * 를 코드로 찍어 색 사각형을 놓았고, 컴파일도 통과하고 씬도 지어졌는데 화면에
 * 나오는 것은 사각형이었다 — **재는 자(컴파일러)가 못 보는 자리**라 여섯 판을
 * 돌아도 그대로였다.
 *
 * ## 아티스트의 규율을 그대로 물려받는다
 *
 * 이 회사에는 이미 게임 그림을 그리는 기술(`skills/gameAssets`)이 있고, 그
 * 규율은 "여러 장 그려서 재고 대부분 버린다" 다. 여기서도 같은 발주 문구
 * 형식과 같은 판정기를 쓴다. **계측기가 두 벌이면 언젠가 서로 다른 답을 내고,
 * 그때부터 판정은 판정이 아니다.**
 *
 * ## 못 잴 때는 못 쟀다고 한다
 *
 * 판정기는 이 저장소 밖(genesis)에 있고 `JUDGE_URL` 로 부른다. 그것이 없는
 * 곳에서는 **그림은 만들되 판정을 지어내지 않는다** — `UNDEFINED` 로 두고
 * 화면도 그렇게 말한다. 통과로 읽으면, 못 볼수록 잘 통과하는 그 병이 그림
 * 쪽에서 다시 시작된다.
 *
 * ## 승인 경로와의 관계
 *
 * `/api/unity/assets` 는 **승인된 산출물만** 유니티에 내보낸다. 여기서 만드는
 * 그림은 그 경로가 아니다 — 코드와 같은 자격으로 세션의 울타리 안에 쓰이고,
 * 같은 방식으로 되돌릴 수 있다(`unity_runner.py --undo`). 게임에 오래 남을
 * 그림은 여전히 아티스트가 그리고 사람이 승인하는 쪽이다.
 */

export type SpriteKind = "character" | "prop";

export type PlannedSprite = {
  name: string;
  purpose: string;
  kind: SpriteKind;
  made: boolean;
  verdict: "PASS" | "FAIL" | "UNDEFINED" | null;
  /** 잰 것만 적는다. 못 쟀으면 비어 있다. */
  measured: Record<string, unknown> | null;
};

/** 한 판에 그리는 장수. 그림은 글보다 느리고 비싸서 조금씩 낸다. */
export const SPRITES_PER_ROUND = 1;

/**
 * 발주 문구의 **형식** 부분.
 *
 * `"pixel art game sprite"` 만 쓰면 한 장에 20프레임이 들어간 시트가 온다.
 * 게임에 넣을 수 없는 물건이고, 그건 생성기가 아니라 주문이 모자란 것이다.
 * 사람과 물건은 형식이 다르다 — 물건에 "full body, facing the viewer" 를
 * 붙이면 상자에 얼굴이 생긴다.
 */
const FORM: Record<SpriteKind, string> = {
  character:
    "Pixel art sprite for a 2D game. Chunky visible square pixels, hard-edged, " +
    "limited palette, no anti-aliasing, no blur, no gradients. ONE single " +
    "character alone, centered, full body, facing the viewer, one standing pose. " +
    "Completely empty transparent background, nothing else: no ground, no floor " +
    "shadow, no vignette, no frame, no border, no grid, no second pose, no text.",
  prop:
    "Pixel art sprite for a 2D game. Chunky visible square pixels, hard-edged, " +
    "limited palette, no anti-aliasing, no blur, no gradients. ONE single object " +
    "alone, centered, seen from the side. Completely empty transparent " +
    "background, nothing else: no ground, no floor shadow, no vignette, no frame, " +
    "no border, no grid, no variations, no text.",
};

/** 파일 이름으로 쓸 수 있는 것만 남긴다. 울타리 안이라도 경로는 우리가 짓는다. */
export function spriteFileName(name: string): string {
  const safe = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return safe || "sprite";
}

export function spritePath(scope: string, name: string): string {
  return `${scope}Sprites/${spriteFileName(name)}.png`;
}

/**
 * 판정기 없이도 말할 수 있는 것.
 *
 * PNG 머리(IHDR)만 읽는다 — 폭·높이·색 종류. 라이브러리 없이 확실히 참인 것만
 * 재고, 색 수나 대비처럼 픽셀을 다 훑어야 아는 것은 판정기에 맡긴다.
 * **알파 채널이 없으면 배경이 투명이 아니다**, 이건 그 자리에서 알 수 있고
 * 게임에 넣었을 때 흰 사각형으로 나타나는 가장 흔한 실패다.
 */
export function readPng(b64: string): {
  ok: boolean;
  bytes: number;
  width?: number;
  height?: number;
  hasAlpha?: boolean;
  why?: string;
} {
  const buf = Buffer.from(b64, "base64");
  if (buf.length < 33) return { ok: false, bytes: buf.length, why: "너무 짧다" };
  const signature = buf.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a")
    return { ok: false, bytes: buf.length, why: "PNG 가 아니다" };
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const colorType = buf[25];
  // 4 = 회색+알파, 6 = 트루컬러+알파.
  const hasAlpha = colorType === 4 || colorType === 6;
  return { ok: true, bytes: buf.length, width, height, hasAlpha };
}

export type DrawnSprite = {
  name: string;
  path: string;
  /** 심부름꾼이 그대로 파일로 쓴다. */
  base64: string;
  verdict: "PASS" | "FAIL" | "UNDEFINED";
  measured: Record<string, unknown>;
  /** 사람이 읽을 한 줄. 왜 이 판정인지. */
  why: string;
};

/**
 * 한 장 그리고, 잴 수 있는 만큼 잰다.
 *
 * 실패해도 던지지 않는다 — 그림 한 장 때문에 게임 만드는 고리가 멈추면,
 * 그림이 없어서 못 만드는 것이 아니라 **있으려다 못 만드는** 것이 된다.
 */
export async function drawSprite(args: {
  sprite: { name: string; purpose: string; kind: SpriteKind };
  scope: string;
  /** 이 회사의 그림 규칙. 있으면 판정기에 같이 넘긴다. */
  bible?: string;
}): Promise<DrawnSprite | { error: string }> {
  const { sprite, scope } = args;
  const prompt = `${FORM[sprite.kind]} ${sprite.purpose}`;

  let b64: string;
  try {
    const drawer = createImageProvider();
    const made = await drawer.draw(prompt);
    b64 = made.dataUrl.split(",")[1] ?? "";
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  if (!b64) return { error: "빈 그림이 돌아왔다" };

  const png = readPng(b64);
  const measured: Record<string, unknown> = {
    bytes: png.bytes,
    width: png.width ?? null,
    height: png.height ?? null,
    hasAlpha: png.hasAlpha ?? null,
  };

  // 여기서 떨어지는 것은 취향이 아니라 사실이다. 알파가 없으면 게임 안에서
  // 흰 사각형이 되고, 그건 사람이 보기 전에 우리가 안다.
  if (!png.ok) {
    return {
      name: sprite.name,
      path: spritePath(scope, sprite.name),
      base64: b64,
      verdict: "FAIL",
      measured,
      why: png.why ?? "그림 파일이 아니다",
    };
  }
  if (png.hasAlpha === false) {
    return {
      name: sprite.name,
      path: spritePath(scope, sprite.name),
      base64: b64,
      verdict: "FAIL",
      measured,
      why: "배경이 투명이 아니다 — 게임에 넣으면 흰 사각형이 따라온다",
    };
  }

  // 취향·팔레트·대비는 판정기의 몫이다. 없으면 **못 쟀다고 말한다.**
  try {
    const verdict = await judgeCharacter([b64], { bible: args.bible });
    return {
      name: sprite.name,
      path: spritePath(scope, sprite.name),
      base64: b64,
      verdict: verdict.verdict,
      measured: {
        ...measured,
        colors: verdict.colors ?? null,
        saturation: verdict.saturation ?? null,
        groundContrast: verdict.ground_contrast ?? null,
      },
      why:
        verdict.verdict === "PASS"
          ? "판정기 통과"
          : (verdict.fail ?? verdict.undefined ?? []).join("; ") || "판정기 판단",
    };
  } catch (error) {
    if (!(error instanceof JudgeUnavailable)) throw error;
    return {
      name: sprite.name,
      path: spritePath(scope, sprite.name),
      base64: b64,
      verdict: "UNDEFINED",
      measured,
      why: "판정 엔진에 닿지 못했습니다 — 모양은 사람이 봐야 압니다",
    };
  }
}
