import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { blockedBySpendLimit } from "@/lib/costs/allowance";
import { meterProviders } from "@/lib/costs/meter";
import { defaultProviders } from "@/lib/execution/shared";

/**
 * 유니티가 낸 컴파일 오류를 받아 고친다.
 *
 * 우리는 생성된 코드를 실행하지 않는다 — 그 문을 열면 이 회사의 모든 열쇠가 그
 * 코드 안에 있다. 그래서 앱 만들기는 지금까지 "파싱은 됩니다"까지만 말할 수
 * 있었다.
 *
 * 그런데 유니티는 **자기 프로젝트를 자기가 컴파일한다.** 그 오류를 이쪽으로
 * 보내 주면, 우리는 아무것도 실행하지 않고도 **진짜 오류**를 알게 된다. 실행의
 * 위험은 유니티 쪽에 그대로 있고(원래 거기 있던 것이다), 고치는 일만 이쪽으로
 * 온다.
 *
 * **고친 코드를 우리가 파일에 쓰지 않는다.** 돌려주기만 하고, 프로젝트에 넣는
 * 것은 사람이 에디터에서 누른다. 남의 디스크에 조용히 쓰는 것은 이 제품이 하지
 * 않는 일이다.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const fixSchema = z.object({
  /** 고친 파일들. **고친 것만** 담는다 — 안 건드린 파일을 돌려주면 받는 쪽이
   *  무엇이 바뀌었는지 모른다. */
  files: z.array(
    z.object({
      path: z.string(),
      contents: z.string(),
      /** 무엇을 왜 고쳤는지 한 줄. 사람이 읽고 틀렸다고 말할 수 있어야 한다. */
      change: z.string(),
    }),
  ),
  /** 고치지 못한 오류. **못 고친 것을 조용히 빼지 않는다.** */
  unresolved: z.array(z.object({ error: z.string(), why: z.string() })),
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

  const errors = (body as { errors?: unknown })?.errors;
  const files = (body as { files?: unknown })?.files;
  if (!Array.isArray(errors) || errors.length === 0) {
    return NextResponse.json({ error: "오류가 없습니다." }, { status: 400 });
  }
  if (!Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
  }

  const providers = meterProviders(defaultProviders(), db, { companyId });

  const { output } = await providers.ai.generateStructuredOutput({
    systemInstructions: [
      "너는 유니티 C# 컴파일 오류를 고친다.",
      "",
      "- **컴파일 오류만 고친다.** 그 김에 구조를 바꾸거나 기능을 더하지 마라 —",
      "  받는 사람은 오류가 사라지기를 기대했지 코드가 달라지기를 기대하지 않았다.",
      "- 고친 파일은 **전체 내용**을 낸다. 조각으로 주면 붙일 수가 없다.",
      "- **안 건드린 파일은 넣지 마라.** 무엇이 바뀌었는지가 목록으로 보여야 한다.",
      "- 오류의 원인이 우리가 못 보는 곳(빠진 패키지, 유니티 버전, 다른 파일)에",
      "  있으면 **고치지 말고 `unresolved` 에 적는다.** 짐작으로 고친 코드는",
      "  오류를 다음 자리로 옮길 뿐이다.",
    ].join("\n"),
    input: [
      "컴파일 오류:",
      (errors as string[]).map((e) => `- ${e}`).join("\n"),
      "",
      "파일:",
      (files as { path: string; contents: string }[])
        .map((f) => `--- ${f.path}\n${f.contents}`)
        .join("\n\n"),
    ].join("\n"),
    schema: fixSchema,
    schemaName: "unity_fix",
    maxTokens: 32000,
    tier: "judgment",
  });

  return NextResponse.json({
    company: company.name,
    ...output,
    note:
      "고친 내용을 돌려줄 뿐 프로젝트에 쓰지 않았습니다. 에디터에서 확인하고 " +
      "적용하십시오. 못 고친 것은 `unresolved` 에 있습니다 — 조용히 빼지 " +
      "않았습니다.",
  });
}
