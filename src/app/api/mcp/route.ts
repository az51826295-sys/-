import { NextResponse } from "next/server";
import { judgeCharacter, judgeMesh, JudgeUnavailable } from "@/lib/providers/judge";
import { noteConnected } from "@/lib/hand/connected";
import { createServiceClient } from "@/lib/supabase/service";
import { authenticateMcp, mcpRefusal, readMcpKey } from "@/lib/hand/mcpAuth";
import { foldVerdict, type RawVerdict } from "@/lib/hand/verdictFold";

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

/**
 * 열쇠는 **사람별**이다 (10-26 고침).
 *
 * 오전 판은 `process.env.MCP_TOKEN` 하나였다 — 남에게 주면 모두가 같은 열쇠를 쓰고
 * 사장님 것도 같이 열린다. 사장님이 "다른 사용자가 연결하는 과정이 구현 돼 있어?" 라고
 * 물어서 드러났다. 새 열쇠를 만들지 않고 **이미 회사별로 있는 `companies.unity_key`** 를 쓴다.
 *
 * 전역 열쇠는 남겨 둔다 — 내 시험·배치용이고, **DB 가 죽어도 통해야** 고치러 들어갈 수 있다.
 * 판단 갈래는 `src/lib/hand/mcpAuth.ts` 에 있고 자가 20/20 으로 돌려 봤다.
 */
async function 누구인가(request: Request) {
  const key = readMcpKey((n) => request.headers.get(n));
  return authenticateMcp(key, {
    globalToken: process.env.MCP_TOKEN ?? null,
    async findCompany(k) {
      const { data, error } = await createServiceClient()
        .from("companies").select("id").eq("unity_key", k).maybeSingle();
      /* 오류를 읽는다 — 안 읽으면 DB 가 죽은 것이 "열쇠가 틀렸다" 로 나온다(오늘 세 번째) */
      if (error) return { kind: "DB못닿음" as const, why: error.message };
      if (!data) return { kind: "없음" as const };
      return { kind: "회사" as const, id: (data as { id: string }).id };
    },
  });
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
      "만든 그림이 기준에 맞는지 잰다. 맞음·어긋남·못 잼과 **잰 숫자**를 돌려주므로, "
      + "어긋나면 무엇이 몇인지 보고 고쳐서 다시 내면 된다.\n"
      /* 10-26: 내가 붙는 쪽이 되어 돌려 보니 이 한 줄이 없어서 세 판을 헛돌았다.
         알파가 없으면 캐릭터를 배경에서 못 갈라서 채도가 10 으로 눌린다(알파 넣으면 62). */
      + "**캐릭터는 배경을 투명하게 비운 PNG 로 내라.** 투명도로 캐릭터를 배경에서 가른다 — "
      + "배경이 칠해져 있으면 배경까지 캐릭터로 세어서 채도·명암이 엉뚱하게 나온다.\n"
      + "`kind` 로 무엇을 낸 것인지 말해라. 스프라이트만 내면 바닥 대비는 **못 잼**이 된다 "
      + "(바닥이 그림에 없으니 잴 수가 없다). 바닥 대비까지 보려면 배경 위에 올린 그림을 "
      + "`in_context` 로 한 번 더 내라.",
    inputSchema: {
      type: "object",
      properties: {
        image_base64: { type: "string", description: "그림 하나, base64 (데이터 URL 접두사 없이)" },
        kind: {
          type: "string", enum: ["sprite", "in_context"],
          description: "sprite = 배경 투명한 캐릭터 한 장(기본) · in_context = 배경 위에 올린 장면",
        },
      },
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
      /* 10-26: 이 두 줄이 없어서 내가 붙는 쪽으로 써 볼 때 세 판을 헛돌았다. */
      + "## 내는 법\n\n"
      + "- **캐릭터는 배경을 투명하게 비운 PNG** 로 낸다. 투명도로 캐릭터를 배경에서 가른다.\n"
      + "- `character` 칸은 캐릭터만 보고 잰다. `min_ground_contrast` 는 **바닥이 있어야** 재므로,\n"
      + "  배경 위에 올린 그림을 `measure_image` 에 `kind: \"in_context\"` 로 한 번 더 내야 잰다.\n"
      + "- `max_color_spread` 는 그림 **여러 장**을 견주는 값이다. 한 장만 내면 못 잼이다.\n\n"
      + "판정은 세 값이다 — 맞음 · 어긋남 · **못 잼**. 못 잰 것을 어긋남으로 읽지 마라.",
    );
  }

  if (name === "measure_image") {
    const b64 = String(args.image_base64 ?? "").replace(/^data:[^,]+,/, "");
    if (!b64) throw new Error("image_base64 가 비었다");
    const kind = args.kind === "in_context" ? "in_context" : "sprite";
    const v = await judgeCharacter([b64]);
    /* 스프라이트 하나로는 만족할 수 없는 조건으로 떨어뜨리지 않는다 — 못 잼으로 옮긴다. */
    const 접힘 = foldVerdict(v as unknown as RawVerdict, kind, 1);
    return 글(요약(접힘 as Record<string, unknown>));
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
  /* **어긋난 것과 못 잰 것을 한 칸에 섞지 않는다** (10-26 고침).
     섞어 놓으니 "바닥 대비 → 못 잼" 이 고쳐야 할 것처럼 보였다. 붙은 도구는
     못 잰 것을 고치러 들어간다 — 그게 세 값을 가르는 뜻을 없앤다. */
  const 규칙 = ((v.rules as { id: string; verdict: string; why: string }[]) ?? []);
  const 어긋난것 = [
    ...((v.fail as string[]) ?? []),
    ...규칙.filter((r) => r.verdict === "FAIL").map((r) => `${r.id}: ${r.why}`),
  ];
  const 못잰것 = [
    ...((v.undefined as string[]) ?? []),
    ...규칙.filter((r) => r.verdict !== "FAIL" && r.verdict !== "PASS").map((r) => `${r.id}: ${r.why}`),
  ];
  const 숫자 = Object.fromEntries(
    Object.entries(v).filter(([k, x]) => typeof x === "number" && k !== "verdict"),
  );
  /* **얼마나 가까운가** (10-28). 어긋남 한 글자만 주면 나아지는지 알 수 없어서
     붙은 도구가 포기한다 — 내가 색을 3→7→12 로 올리고도 네 판 내내 같은 글자를 봤다. */
  const 가까움 = (v.progress as { id: string; got: number; need: number; ok: boolean; ratio: number; 방향: string }[] | undefined) ?? [];
  const 막대 = (r: number) => "█".repeat(Math.round(r * 10)) + "░".repeat(10 - Math.round(r * 10));
  /* **못 잰 칸은 막대에서 뺀다.** 안 빼면 "고치지 마라" 라고 적어 놓고 바로 밑에서
     2/10 짜리 막대를 보여 주게 된다 — 그건 고치라고 부르는 것이다(10-28 에 내가 만든 구멍). */
  const 못잰말 = 못잰것.join(" ");
  const 잴수있는것 = 가까움.filter((p) => !못잰말.includes(p.id) && !(p.id === "ground_contrast" && 못잰말.includes("바닥")));
  const 가까움칸 = 잴수있는것.length
    ? "\n### 얼마나 왔나\n" + 잴수있는것.map((p) =>
        `- ${p.ok ? "·" : " "} \`${막대(p.ratio)}\` ${p.id} ${p.got} / ${p.need} ${p.방향}`).join("\n")
      + (v.closest ? `\n\n**${String(v.closest)}**` : "")
    : "";

  return [
    `## ${표}`,
    어긋난것.length ? "\n### 고쳐야 할 것 (어긋남)\n" + 어긋난것.map((c) => "- " + c).join("\n") : "",
    가까움칸,
    못잰것.length ? "\n### 못 잰 것 — **고치지 마라**\n" + 못잰것.map((c) => "- " + c).join("\n") : "",
    Object.keys(숫자).length ? "\n### 잰 값\n```json\n" + JSON.stringify(숫자, null, 2) + "\n```" : "",
    판정 === "UNDEFINED" ? "\n**못 잰 것이지 어긋난 게 아니다.** 고치러 들어가기 전에 왜 못 쟀는지 먼저 봐라." : "",
  ].filter(Boolean).join("\n");
}

export async function POST(request: Request) {
  const who = await 누구인가(request);
  if (who.kind !== "회사" && who.kind !== "서버열쇠") {
    const r = mcpRefusal(who);
    return NextResponse.json({ error: r.error }, { status: r.status });
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
    if (req.method === "tools/list") {
      /* 붙었다는 사실을 남긴다 — 화면이 "열려 있다" 와 "붙어 있다" 를 가르려면 이게 필요하다. */
      noteConnected("mcp", "도구 목록을 받아 갔어요");
      return 답({ tools: 도구들 });
    }
    if (req.method === "tools/call") {
      const name = String(req.params?.name ?? "");
      const args = (req.params?.arguments ?? {}) as Record<string, unknown>;
      noteConnected("mcp", name === "get_standard" ? "기준을 받아 갔어요" : "만든 것을 재 갔어요");
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
    열쇠받는곳: "로키 메뉴 → 내 연결 열쇠",
    쓰는법: "claude mcp add --transport http rookery <이 주소> --header \"Authorization: Bearer <내 연결 열쇠>\"",
  });
}
