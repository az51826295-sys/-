import { NextResponse } from "next/server";
import { judgeCharacter, judgeMesh, JudgeUnavailable } from "@/lib/providers/judge";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * **로키 콘센트 — 사장님이 쓰던 AI 가 여기에 붙는다** (10-26).
 *
 * 사장님: "그 사람이 쓰던 클로드·코덱스랑 연결이 가능하고 **일관성을 제공**했으면 좋겠어."
 *
 * 클로드 코드·커서 같은 도구는 **MCP** 를 말한다. 그 도구가 여기 붙으면:
 *   · 로키가 **기준**을 내주고 → 그 도구가 기준에 맞게 만들고
 *   · 만든 걸 **로키가 재서** 맞음/어긋남/못 잼으로 돌려준다
 * 로키는 모델을 안 부른다 — **만드는 값은 그쪽 구독으로 나가고, 로키는 자만 댄다.**
 *
 * **로키 DB 를 안 쓴다.** 판정 서비스(`JUDGE_URL`)만 부르므로 DB 가 멈춰 있어도 돈다.
 * (장부에 붙는 도구 — 만든 것 목록·지난 판정 — 은 DB 가 살아난 뒤에 더한다.)
 *
 * 프로토콜: JSON-RPC 2.0 over HTTP POST. `initialize` · `tools/list` · `tools/call` 셋만 받는다.
 * MCP 전체를 구현하지 않는다 — 도구를 쓰는 데 필요한 것이 이 셋이다.
 */

const 이름 = "rookery";
const 판 = "2024-11-05";

/** 열쇠. 없으면 아무나 우리 판정 서비스를 쓰게 되므로 **없으면 닫는다.** */
function 들여보낼까(request: Request): boolean {
  const 열쇠 = process.env.MCP_TOKEN;
  if (!열쇠) return false;
  const h = request.headers.get("authorization") ?? "";
  return h === `Bearer ${열쇠}` || request.headers.get("x-rookery-mcp") === 열쇠;
}

const 도구들 = [
  {
    name: "get_standard",
    description:
      "로키가 들고 있는 일관성 기준을 준다. 그림·3D 를 만들기 **전에** 먼저 불러서 이 숫자에 맞춰 만든다. "
      + "기준의 근거는 사장님이 고른 레퍼런스 화면의 실측값이다 — 취향이 아니라 계약이다.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "measure_image",
    description:
      "만든 그림이 기준에 맞는지 잰다. base64 PNG/JPG 를 주면 맞음·어긋남·못 잼과 **잰 숫자**를 돌려준다. "
      + "어긋나면 무엇이 몇인지 말해 주므로 그걸 보고 고쳐서 다시 내면 된다.",
    inputSchema: {
      type: "object",
      properties: { image_base64: { type: "string", description: "그림 하나, base64 (데이터 URL 접두사 없이)" } },
      required: ["image_base64"], additionalProperties: false,
    },
  },
  {
    name: "measure_mesh",
    description: "만든 3D 모델(.glb)이 규격에 맞는지 잰다. base64 GLB 를 주면 규칙별로 맞음·어긋남·못 잼을 돌려준다.",
    inputSchema: {
      type: "object",
      properties: { glb_base64: { type: "string", description: ".glb 하나, base64" } },
      required: ["glb_base64"], additionalProperties: false,
    },
  },
];

const 글 = (t: string) => ({ content: [{ type: "text", text: t }] });

async function 도구부르기(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === "get_standard") {
    const base = process.env.JUDGE_URL ?? "http://127.0.0.1:8000";
    const r = await fetch(base + "/api/judge/thresholds", { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new JudgeUnavailable(`HTTP ${r.status}`);
    const th = await r.json() as { basis?: string };
    return 글(
      "# 로키 일관성 기준\n\n"
      + "아래 숫자에 맞춰 만들어라. 만든 뒤에는 `measure_image` 로 재서 확인해라.\n\n"
      + "```json\n" + JSON.stringify(th, null, 2) + "\n```\n\n"
      + (th.basis ? `근거: ${th.basis}\n\n` : "")
      + "판정은 세 값이다 — 맞음 · 어긋남 · **못 잼**. 못 잰 것을 어긋남으로 읽지 마라.",
    );
  }

  if (name === "measure_image") {
    const b64 = String(args.image_base64 ?? "").replace(/^data:[^,]+,/, "");
    if (!b64) throw new Error("image_base64 가 비었다");
    const v = await judgeCharacter([b64]);
    return 글(요약(v as unknown as Record<string, unknown>));
  }

  if (name === "measure_mesh") {
    const b64 = String(args.glb_base64 ?? "").replace(/^data:[^,]+,/, "");
    if (!b64) throw new Error("glb_base64 가 비었다");
    const v = await judgeMesh({ glbBase64: b64 });
    return 글(요약(v as unknown as Record<string, unknown>));
  }

  throw new Error(`그런 도구가 없다: ${name}`);
}

/** 판정을 사람도 모델도 읽을 수 있게 — **잰 숫자를 꼭 같이 적는다.** 숫자가 없으면 못 고친다. */
function 요약(v: Record<string, unknown>): string {
  const 판정 = String(v.verdict ?? "UNDEFINED");
  const 표 = 판정 === "PASS" ? "· 맞음" : 판정 === "FAIL" ? "≠ 어긋남" : "– 못 잼";
  const 까닭 = [
    ...((v.fail as string[]) ?? []),
    ...((v.undefined as string[]) ?? []),
    ...(((v.rules as { id: string; verdict: string; why: string }[]) ?? [])
      .filter((r) => r.verdict !== "PASS")
      .map((r) => `${r.id}: ${r.why}`)),
  ];
  const 숫자 = Object.fromEntries(
    Object.entries(v).filter(([k, x]) => typeof x === "number" && k !== "verdict"),
  );
  return [
    `## ${표}`,
    까닭.length ? "\n### 까닭\n" + 까닭.map((c) => "- " + c).join("\n") : "",
    Object.keys(숫자).length ? "\n### 잰 값\n```json\n" + JSON.stringify(숫자, null, 2) + "\n```" : "",
    판정 === "UNDEFINED" ? "\n**못 잰 것이지 어긋난 게 아니다.** 고치러 들어가기 전에 왜 못 쟀는지 먼저 봐라." : "",
  ].filter(Boolean).join("\n");
}

export async function POST(request: Request) {
  if (!들여보낼까(request)) {
    return NextResponse.json({ error: "열쇠가 필요해요" }, { status: 401 });
  }

  const req = (await request.json().catch(() => null)) as
    { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> } | null;
  if (!req?.method) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const 답 = (result: unknown) => NextResponse.json({ jsonrpc: "2.0", id: req.id ?? null, result });
  const 탈 = (code: number, message: string) =>
    NextResponse.json({ jsonrpc: "2.0", id: req.id ?? null, error: { code, message } });

  try {
    if (req.method === "initialize") {
      return 답({
        protocolVersion: 판,
        capabilities: { tools: {} },
        serverInfo: { name: 이름, version: "0.1.0" },
      });
    }
    /* 알림은 답을 안 바란다 — 빈 200 을 준다 */
    if (req.method.startsWith("notifications/")) return new NextResponse(null, { status: 204 });
    if (req.method === "tools/list") return 답({ tools: 도구들 });
    if (req.method === "tools/call") {
      const name = String(req.params?.name ?? "");
      const args = (req.params?.arguments ?? {}) as Record<string, unknown>;
      return 답(await 도구부르기(name, args));
    }
    return 탈(-32601, `모르는 길: ${req.method}`);
  } catch (e) {
    /* 못 닿은 것과 어긋난 것을 가른다 — 도구가 "어긋남" 으로 읽으면 멀쩡한 것을 고치러 든다 */
    if (e instanceof JudgeUnavailable) {
      return 답({ ...글("– 못 잼 — 판정 서비스에 못 닿았다. **어긋난 게 아니다.**"), isError: true });
    }
    return 답({ ...글("못 쟀다: " + (e instanceof Error ? e.message : String(e)).slice(0, 200)), isError: true });
  }
}

/** 붙었는지 눈으로 보려고 — 열쇠 없이도 "살아 있다" 까지는 말한다 */
export async function GET() {
  return NextResponse.json({
    name: 이름,
    protocol: 판,
    tools: 도구들.map((t) => t.name),
    열쇠필요: true,
    쓰는법: "claude mcp add --transport http rookery <이 주소> --header \"Authorization: Bearer <MCP_TOKEN>\"",
  });
}
