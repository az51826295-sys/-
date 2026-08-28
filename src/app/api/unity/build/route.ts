import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { blockedBySpendLimit } from "@/lib/costs/allowance";
import { meterProviders } from "@/lib/costs/meter";
import { defaultProviders } from "@/lib/execution/shared";
import { retrieveCompanyKnowledge, renderCompanyKnowledge } from "@/lib/knowledge/retrieval";

/**
 * 유니티가 요청한 스크립트를 만들어 돌려준다.
 *
 * 지금까지 앱 만들기는 "파싱은 됩니다"까지만 말할 수 있었다. 코드를 실행하지
 * 않기 때문이고, 실행하지 않는 이유는 **실행하면 회사의 모든 열쇠가 그 코드
 * 안에 놓이기** 때문이다.
 *
 * 그런데 유니티는 자기 프로젝트를 자기가 컴파일한다. 그러니 이 경로로 낸 코드는
 * **몇 초 뒤에 진짜 판정을 받는다** — 우리가 아무것도 실행하지 않고도. 오류가
 * 나면 `/api/unity/fix` 로 돌아온다.
 *
 * 그래서 여기서는 `app_build` 와 같은 규율을 쓰되 한 가지가 다르다: 합격 기준을
 * **컴파일 이후에 사람이 확인할 것**으로 쓴다. 컴파일은 유니티가 하고, 나머지는
 * 여전히 사람이 본다.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const buildSchema = z.object({
  /** 무엇을 만들었는지 한 줄. 창 제목이 된다. */
  title: z.string(),
  /**
   * 확인할 수 있는 기준. **코드보다 먼저 쓴다.**
   *
   * 컴파일은 유니티가 알려 주므로 여기 적을 것은 그 다음이다 — 씬에서 무엇을
   * 하면 무엇이 되어야 하는가.
   */
  criteria: z.array(
    z.object({ id: z.string(), when: z.string(), then: z.string() }),
  ),
  files: z.array(
    z.object({
      /** `Assets/` 아래 상대 경로. 유니티가 그대로 쓴다. */
      path: z.string(),
      contents: z.string(),
      /** 이 파일이 무엇인지 한 줄. */
      purpose: z.string(),
    }),
  ),
  /** 씬에서 무엇을 해야 하는지. 컴포넌트를 어디에 붙이는지 등. */
  setup: z.string(),
  /** 잴 수 없어 사람 눈에 남기는 것. 숨기지 않는다. */
  humanGate: z.array(z.string()),
});

export async function POST(request: Request) {
  const key = request.headers.get("x-rookery-key");
  if (!key) {
    return NextResponse.json(
      { error: "x-rookery-key 헤더가 필요합니다." },
      { status: 401 },
    );
  }

  const db = createServiceClient();
  const { data: company } = await db
    .from("companies")
    .select("id, name")
    .eq("unity_key", key)
    .maybeSingle();
  if (!company) {
    return NextResponse.json({ error: "열쇠가 맞지 않습니다." }, { status: 403 });
  }
  const companyId = company.id as string;

  if (await blockedBySpendLimit(db, companyId)) {
    return NextResponse.json(
      { error: "이번 기간 지출 한도에 걸려 있습니다." },
      { status: 402 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const want = (body as { want?: unknown })?.want;
  if (typeof want !== "string" || want.trim().length < 5) {
    return NextResponse.json(
      { error: "무엇을 만들지 적어 주십시오." },
      { status: 400 },
    );
  }
  const unityVersion = (body as { unityVersion?: unknown })?.unityVersion;
  const existing = (body as { existing?: unknown })?.existing;

  // 회사가 배운 것을 그대로 싣는다. 대화에서 "우린 픽셀아트 48px 쓴다"고
  // 말했으면 여기서도 그게 지켜져야 한다 — 창구마다 다른 것을 알면 회사가
  // 아니라 창구다.
  const knowledge = renderCompanyKnowledge(
    await retrieveCompanyKnowledge(db, companyId),
  );

  const providers = meterProviders(defaultProviders(), db, { companyId });

  const { output } = await providers.ai.generateStructuredOutput({
    systemInstructions: [
      "너는 유니티 C# 스크립트를 쓴다.",
      "",
      "- **먼저 합격 기준을 쓴다.** 씬에서 무엇을 하면 무엇이 되어야 하는지,",
      "  사람이 눌러 보고 확인할 수 있는 문장으로. 컴파일 여부는 유니티가",
      "  알려 주므로 기준에 넣지 마라.",
      "- 파일은 **전체를 낸다.** `// ...` 로 생략하면 붙일 수가 없다.",
      "- 경로는 `Assets/` 로 시작한다. 클래스 이름과 파일 이름을 맞춘다 —",
      "  유니티는 MonoBehaviour 에서 그것이 어긋나면 컴포넌트를 못 붙인다.",
      "- 없는 패키지에 의존하지 마라. 기본 유니티로 되는 범위에서 쓴다.",
      "- 잴 수 없는 것(재미, 손맛)은 `humanGate` 에 적는다. 기준인 척하지 마라.",
      typeof unityVersion === "string" && unityVersion
        ? `\n대상 유니티 버전: ${unityVersion}`
        : "",
      knowledge ? `\n이 회사가 아는 것:\n${knowledge}` : "",
    ].join("\n"),
    input: [
      `만들 것: ${want}`,
      Array.isArray(existing) && existing.length
        ? "\n프로젝트에 이미 있는 관련 파일:\n" +
          (existing as { path: string; contents: string }[])
            .map((f) => `--- ${f.path}\n${f.contents}`)
            .join("\n\n")
        : "",
    ].join("\n"),
    schema: buildSchema,
    schemaName: "unity_build",
    maxTokens: 32000,
    tier: "judgment",
  });

  return NextResponse.json({
    company: company.name,
    ...output,
    note:
      "파일을 프로젝트에 쓰지 않았습니다 — 확인하고 적용하십시오. " +
      "적용하면 유니티가 컴파일하고, 오류가 나면 '컴파일 오류 고치기' 로 " +
      "돌아옵니다. 합격 기준은 컴파일 이후에 사람이 확인할 것입니다.",
  });
}
