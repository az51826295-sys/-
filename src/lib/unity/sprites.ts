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
  /**
   * 실제로 파일이 나간 경로. **그린 것과 그리려다 만 것을 가르는 칸이다.**
   *
   * `made` 로는 못 가른다 — 못 그린 판도 "이 장은 끝났다"는 뜻으로 `made` 를
   * 세운다. `made` 만 보고 코드에 경로를 넘기면 없는 파일을 가리키는 코드가
   * 만들어지고, 컴파일은 통과하고 화면만 빈다.
   */
  path?: string | null;
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

/** 줄바꿈. 코드값으로 둔다 — 이 파일을 쓰는 길에서 역슬래시가 먹힌 적이 있다. */
const NL = String.fromCharCode(10);

/**
 * 이 그림의 파일이 실제로 있는가. 있으면 그 경로.
 *
 * 옛 줄에는 `path` 칸이 없다. 그때도 경로는 이름에서 그대로 지어졌고, 그린
 * 판에만 `measured` 가 붙었다(못 그린 판은 `measured: null`). 옛 줄은 그것으로
 * 가른다 — 짐작이 아니라 그 시절의 기록이다.
 */
export function drawnPath(scope: string, sp: PlannedSprite): string | null {
  if (sp.path) return sp.path;
  if (sp.made && sp.measured) return spritePath(scope, sp.name);
  return null;
}

/**
 * 아직 그림도 소리도 없을 때 쓰는 판에 주는 쪽지. **프로토타입 우선.**
 *
 * 09-01 사장님 지시로 순서가 바뀌었다: 프로토타입을 먼저 만들고, 사람이 보고
 * 승인하면 그때 그림과 소리를 넣는다.
 *
 * 그래서 이 쪽지의 요점은 하나다 — **나중에 파일만 넣으면 되게 짜라.**
 * 있으면 쓰고 없으면 도형으로 도는 코드를 처음부터 쓰게 하면, 승인 뒤에
 * 코드를 다시 안 만진다. 이 계약이 없으면 승인할 때마다 게임을 다시 짓게 되고,
 * 그러면 승인이 값싼 절차가 아니라 비싼 절차가 된다.
 */
export function pendingArtNote(scope: string, sprites: PlannedSprite[]): string {
  const out = [
    NL + "**아직 그림도 소리도 없다. 도형과 색으로 먼저 짓는다.**",
    "사람이 이 프로토타입을 보고 승인하면 그때 그림과 소리가 아래 경로로 들어온다.",
    "그러니 처음부터 이렇게 써라:",
    `- 그림은 \`${scope}Sprites/<이름>.png\` 가 **있으면 불러 쓰고, 없으면** 도형이나`,
    "  단색으로 그린다,",
    `- 소리는 \`${scope}Audio/<이름>.wav\` 가 **있으면 재생하고, 없으면** 조용히 넘어간다,`,
    "- 있고 없고를 **한 자리에서** 판단해라(작은 도우미 하나). 그래야 나중에 파일만",
    "  넣으면 되고 코드를 다시 안 만진다,",
    "- 없을 때 오류를 내거나 멈추지 마라. **프로토타입은 그림 없이도 끝까지 돌아야 한다.**",
  ];

  if (sprites.length) {
    out.push(
      "",
      "설계가 적어 둔 그림 목록(발주서다. 아직 아무것도 안 그렸다):",
      ...sprites.map((sp) => `- ${spritePath(scope, sp.name)} — ${sp.purpose}`),
      "이 이름들로 자리를 잡아 두면 승인 뒤에 그대로 꽂힌다.",
    );
  }
  return out.join(NL);
}

/**
 * 쓰는 판에 **무엇이 실제로 만들어졌는지** 알려 주는 쪽지.
 *
 * 이것이 없어서 08-31 에 그림 세 장을 그려 놓고도 화면의 플레이어가 초록
 * 사각형이었다. 설계도는 "그림 목록에 있으면 그 경로를 쓰라"고 말했지만, 쓰는
 * 판은 **무엇이 실제로 만들어졌는지 못 들었다.** 그래서 코드가 `Texture2D` 로
 * 때웠고, 컴파일은 통과했고, 컴파일러가 못 보는 자리라 아무도 안 걸렸다.
 *
 * 쪽지는 한 벌만 만든다. 쓰는 판과 고치는 판이 서로 다른 목록을 받으면, 고치는
 * 판이 그림을 모른 채 씬 빌더를 다시 써서 방금 이은 것을 도로 끊는다.
 */
export function spriteNote(scope: string, sprites: PlannedSprite[]): string {
  if (!sprites.length) return "";

  const have: string[] = [];
  const lost: string[] = [];
  for (const sp of sprites) {
    const path = drawnPath(scope, sp);
    if (path) {
      have.push(`- ${path} — ${sp.purpose} (판정 ${sp.verdict ?? "없음"})`);
    } else if (sp.made) {
      lost.push(`- ${sp.name} — ${sp.purpose}`);
    }
  }

  const out = [NL + "만들어 둔 그림:"];
  if (have.length) {
    out.push(
      ...have,
      "",
      "이 경로의 파일은 **이미 있다.** 색 사각형을 새로 찍지 말고 이 파일을 써라.",
      // 임포터 설정에 기대면 조용히 null 이 온다 — 컴파일은 통과하고 화면만
      // 빈다. 우리가 여섯 번 밟은 자리라 읽는 법까지 적어 준다.
      "읽을 때는 `AssetDatabase.LoadAssetAtPath<Texture2D>` 로 읽고 `Sprite.Create`",
      "로 만들어라. PNG 가 Sprite 로 임포트돼 있지 않은 프로젝트가 있고, 그때",
      "`LoadAssetAtPath<Sprite>` 는 조용히 null 을 돌려준다.",
      "픽셀 그림이라 `FilterMode.Point` 로 둔다.",
      "판정이 FAIL 이어도 쓴다 — 판정을 채택에 잇는 것은 아직 안 정해졌다.",
    );
  } else {
    out.push("- 없다. 전부 코드로 그린다.");
  }

  if (lost.length) {
    out.push(
      NL + "그리려다 못 그린 것 — 파일이 없다. 이것만 코드로 때워라:",
      ...lost,
    );
  }
  return out.join(NL);
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
