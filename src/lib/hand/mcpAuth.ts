import { timingSafeEqual } from "node:crypto";

/**
 * **MCP 문을 사람별로 연다** (10-26).
 *
 * 사장님: "다른 사용자가 AI 연결하는 과정이 구현 되어 있어?" → 안 돼 있었다.
 * 내가 10-26 오전에 만든 MCP 열쇠는 **서버 전체에 하나**(`process.env.MCP_TOKEN`)였다.
 * 남에게 주면 모두가 같은 열쇠를 쓰게 되고 사장님 것도 같이 열린다.
 * BYOK 를 "열쇠가 하나라 못 한다" 고 적어 두고 **내가 똑같은 것을 또 만들었다.**
 *
 * 새 열쇠 체계를 안 만든다 — **이미 회사별로 있는 `companies.unity_key`** 를 쓴다
 * (손 v0~v2 가 쓰던 그것). 하나를 더 만들면 사람이 어느 걸 넣어야 하는지 모른다.
 *
 * ## 판단을 떼어낸 이유
 *
 * 로키 DB 가 끊겨 있어서 진짜 질의를 못 돌린다. 그런데 **갈래 자체는 잴 수 있다** —
 * 찾는 일을 인자로 받으면 가짜로 넣어 여섯 갈래를 전부 돌려 볼 수 있다.
 * 파일 안에 묻어 두면 "코드 완료" 로 끝났을 것이다([[unrun-code-is-unmeasured]]).
 *
 * 이름은 ASCII 로 둔다(한글 export 는 tsx 가 조용히 흘린다 — 10-25).
 */

/** 열쇠로 회사를 찾은 결과. **못 닿은 것과 없는 것을 가른다.** */
export type FoundCompany =
  | { kind: "회사"; id: string }
  | { kind: "없음" }
  | { kind: "DB못닿음"; why: string };

/** 문 앞에 선 사람이 누구인가. */
export type McpWho =
  | { kind: "회사"; id: string }
  /** 서버 전체 열쇠 — 내 시험·배치용이다. 사람에게 주는 열쇠가 아니다. */
  | { kind: "서버열쇠" }
  | { kind: "열쇠없음" }
  | { kind: "열쇠틀림" }
  | { kind: "DB못닿음"; why: string };

/** 헤더에서 열쇠를 꺼낸다. `Authorization: Bearer x` 또는 `x-rookery-mcp: x`. */
export function readMcpKey(get: (name: string) => string | null): string | null {
  const auth = get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    const v = auth.slice(7).trim();
    if (v) return v;
  }
  const h = (get("x-rookery-mcp") ?? "").trim();
  return h || null;
}

/** 길이가 같을 때만 상수 시간 비교 — `===` 는 앞 글자부터 틀리는 시점이 새어 나간다. */
function sameSecret(a: string, b: string): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

/**
 * 문을 지킨다.
 *
 * **전역 열쇠가 없으면 그 길만 닫힌다** — 사람별 열쇠는 그대로 돈다.
 * (오전 판은 전역 열쇠가 없으면 **전부** 닫았다. 그러면 남이 영영 못 쓴다.)
 * 어느 쪽도 아니면 닫는다 — 열쇠가 없을 때 열어 주는 길은 만들지 않는다.
 */
export async function authenticateMcp(
  key: string | null,
  deps: { globalToken?: string | null; findCompany: (key: string) => Promise<FoundCompany> },
): Promise<McpWho> {
  if (!key) return { kind: "열쇠없음" };

  const g = deps.globalToken ?? null;
  if (g && sameSecret(key, g)) return { kind: "서버열쇠" };

  const found = await deps.findCompany(key);
  if (found.kind === "회사") return { kind: "회사", id: found.id };
  if (found.kind === "DB못닿음") return { kind: "DB못닿음", why: found.why };
  return { kind: "열쇠틀림" };
}

/** 사람에게 보여 줄 한 줄과 HTTP 숫자. 못 닿은 것을 "틀렸다" 로 적지 않는다. */
export function mcpRefusal(who: McpWho): { status: number; error: string } {
  if (who.kind === "DB못닿음") {
    return { status: 503, error: "로키 DB 에 못 닿았어요 — 열쇠가 틀린 게 아니에요: " + who.why.slice(0, 160) };
  }
  if (who.kind === "열쇠없음") {
    return { status: 401, error: "연결 열쇠가 필요해요. 로키 메뉴의 '내 연결 열쇠' 에서 받으세요." };
  }
  return { status: 403, error: "연결 열쇠가 맞지 않아요." };
}
