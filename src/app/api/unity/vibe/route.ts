import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { blockedBySpendLimit } from "@/lib/costs/allowance";
import { meterProviders } from "@/lib/costs/meter";
import { defaultProviders } from "@/lib/execution/shared";
import { retrieveCompanyKnowledge, renderCompanyKnowledge } from "@/lib/knowledge/retrieval";
import { decide, fingerprint, insideScope, type CompileError } from "@/lib/unity/progress";

/**
 * 유니티와 **돌면서** 만든다.
 *
 * `/api/unity/build` 는 한 번 만들어 주고 끝났다. 오류가 나면 사람이 다른 창에
 * 옮겨 붙여야 했고, 그건 협업이 아니라 창구 두 개였다.
 *
 * 여기서는 판이 이어진다: 낸다 → 유니티가 붙이고 컴파일한다 → 오류가 돌아온다
 * → 고쳐 낸다. 우리는 여전히 **아무 코드도 실행하지 않는다.** 컴파일은 유니티가
 * 하고, 우리는 그 결과만 읽는다. 위험은 원래 있던 자리에 그대로 있고, 고치는
 * 일만 이쪽으로 온다.
 *
 * 자동으로 도는 물건이니 두 가지를 반드시 지킨다:
 * - **울타리.** 세션이 정한 폴더 밖에는 못 쓴다.
 * - **멈추는 규칙.** 같은 오류가 두 판 연속이면 그만둔다 — 안 그러면 돈만 쓴다.
 *
 * 그리고 컴파일이 통과해도 "됐다"고 말하지 않는다. 컴파일은 문법이 맞다는
 * 뜻이지 원하던 것이 됐다는 뜻이 아니다. 그건 사람이 씬에서 본다.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 판을 무한히 돌리지 않는다. 여기서 멈추고 사람에게 넘긴다. */
const MAX_ROUNDS = 6;

const roundSchema = z.object({
  files: z.array(
    z.object({
      path: z.string(),
      contents: z.string(),
      purpose: z.string(),
    }),
  ),
  /** 이 판에 무엇을 왜 했는지 한 줄. 사람이 읽고 틀렸다고 말할 수 있어야 한다. */
  note: z.string(),
});

const firstSchema = roundSchema.extend({
  title: z.string(),
  /** 코드보다 먼저 쓴다. 컴파일 여부는 유니티가 알려 주니 여기 넣지 않는다. */
  criteria: z.array(
    z.object({ id: z.string(), when: z.string(), then: z.string() }),
  ),
  setup: z.string(),
  /** 잴 수 없어 사람 눈에 남기는 것. 기준인 척하지 않는다. */
  humanGate: z.array(z.string()),
});

const RULES = [
  "너는 유니티 C# 스크립트를 쓴다. 사람이 옆에서 보고 있고, 유니티가 네 코드를",
  "몇 초 뒤에 컴파일한다. 오류는 그대로 너에게 돌아온다.",
  "",
  "- 파일은 **전체를 낸다.** 생략 표시로 줄이면 붙일 수가 없다.",
  "- 클래스 이름과 파일 이름을 맞춘다 — 어긋나면 컴포넌트를 못 붙인다.",
  "- 없는 패키지에 의존하지 마라. 기본 유니티로 되는 범위에서 쓴다.",
  "- 바꿀 필요가 없는 파일은 **내지 마라.** 그대로 다시 내면 받는 쪽이 무엇이",
  "  바뀌었는지 모른다.",
  "- 잴 수 없는 것(재미, 손맛)은 기준인 척하지 마라.",
].join("\n");

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
  const b = body as {
    sessionId?: unknown;
    want?: unknown;
    scope?: unknown;
    unityVersion?: unknown;
    errors?: unknown;
    project?: unknown;
  };

  const errors: CompileError[] = Array.isArray(b.errors)
    ? (b.errors as CompileError[])
        .filter(
          (e) => e && typeof e.message === "string" && typeof e.file === "string",
        )
        // 오류가 백 개 나도 원인은 대개 몇 개다. 다 실으면 창이 오류로만 찬다.
        .slice(0, 40)
    : [];

  const providers = meterProviders(defaultProviders(), db, { companyId });
  const knowledge = renderCompanyKnowledge(
    await retrieveCompanyKnowledge(db, companyId),
  );
  const versionNote =
    typeof b.unityVersion === "string" && b.unityVersion
      ? "\n대상 유니티 버전: " + b.unityVersion
      : "";

  // ── 첫 판: 세션을 연다 ───────────────────────────────────────
  if (typeof b.sessionId !== "string" || !b.sessionId) {
    const want = typeof b.want === "string" ? b.want.trim() : "";
    if (want.length < 5) {
      return NextResponse.json(
        { error: "무엇을 만들지 적어 주십시오." },
        { status: 400 },
      );
    }
    const scope =
      typeof b.scope === "string" && b.scope.startsWith("Assets/")
        ? b.scope.endsWith("/")
          ? b.scope
          : b.scope + "/"
        : "Assets/Rookery/";

    const { output } = await providers.ai.generateStructuredOutput({
      systemInstructions: [
        RULES,
        "",
        "**먼저 합격 기준을 쓴다.** 씬에서 무엇을 하면 무엇이 되어야 하는지,",
        "사람이 눌러 보고 확인할 수 있는 문장으로. 컴파일 여부는 기준이 아니다.",
        "\n파일은 반드시 " + scope + " 아래에만 만든다.",
        versionNote,
        knowledge ? "\n이 회사가 아는 것:\n" + knowledge : "",
      ].join("\n"),
      input: [
        "만들 것: " + want,
        Array.isArray(b.project) && b.project.length
          ? "\n프로젝트에 이미 있는 관련 파일:\n" +
            (b.project as { path: string; contents: string }[])
              .map((f) => "--- " + f.path + "\n" + f.contents)
              .join("\n\n")
          : "",
      ].join("\n"),
      schema: firstSchema,
      schemaName: "unity_vibe_first",
      maxTokens: 32000,
      tier: "judgment",
    });

    const kept = output.files.filter((f) => insideScope(f.path, scope));
    const refused = output.files.filter((f) => !insideScope(f.path, scope));

    const { data: session } = await db
      .from("unity_sessions")
      .insert({
        company_id: companyId,
        want,
        scope,
        criteria: output.criteria,
        round: 1,
        status: "running",
      })
      .select("id")
      .single();
    const sessionId = session?.id as string | undefined;
    if (!sessionId) {
      return NextResponse.json(
        { error: "세션을 열지 못했습니다." },
        { status: 500 },
      );
    }
    await db.from("unity_rounds").insert({
      session_id: sessionId,
      round: 1,
      files: kept.map((f) => ({ path: f.path, purpose: f.purpose })),
      note: output.note,
    });

    return NextResponse.json({
      sessionId,
      round: 1,
      status: "running",
      scope,
      title: output.title,
      criteria: output.criteria,
      setup: output.setup,
      humanGate: output.humanGate,
      files: kept,
      // 울타리 밖으로 나가려 한 것을 조용히 버리지 않는다. 버린 줄 모르면
      // 왜 안 되는지도 모른다.
      refused: refused.map((f) => f.path),
      note: output.note,
    });
  }

  // ── 다음 판: 오류를 받아 고친다 ──────────────────────────────
  const { data: session } = await db
    .from("unity_sessions")
    .select("id, want, scope, criteria, round, status")
    .eq("id", b.sessionId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!session) {
    return NextResponse.json({ error: "그런 세션이 없습니다." }, { status: 404 });
  }
  if (session.status !== "running") {
    return NextResponse.json(
      { error: "이미 끝난 세션입니다 (" + session.status + ")." },
      { status: 409 },
    );
  }

  const scope = session.scope as string;
  const round = session.round as number;

  // 지난 판의 오류. 같은 것이 또 왔는지 보려면 이게 있어야 한다.
  const { data: prevRows } = await db
    .from("unity_rounds")
    .select("errors, files, note, round")
    .eq("session_id", session.id)
    .order("round", { ascending: false })
    .limit(3);
  const prev = (prevRows ?? []) as {
    errors: CompileError[];
    files: { path: string; purpose: string }[];
    note: string | null;
    round: number;
  }[];
  // 방금 온 오류를 적기 전에 지문을 뜬다. 아래에서 이번 판 줄을 갱신하므로,
  // 순서가 바뀌면 자기 자신과 비교하게 되고 늘 "같다"가 나온다.
  const beforeThis = prev.find((r) => r.round < round) ?? null;
  const previousFingerprint =
    beforeThis && beforeThis.errors?.length
      ? fingerprint(beforeThis.errors)
      : null;

  // 이번 판에 돌아온 오류를 **먼저 기록한다.** 판정 결과와 상관없이 남는다 —
  // 통과했을 때만 적으면 나중에 몇 판 만에 됐는지 셀 수 없다.
  await db
    .from("unity_rounds")
    .update({ errors })
    .eq("session_id", session.id)
    .eq("round", round);

  const verdict = decide({
    round,
    maxRounds: MAX_ROUNDS,
    errors,
    previous: previousFingerprint,
  });

  if (!verdict.go) {
    await db
      .from("unity_sessions")
      .update({
        status: verdict.status,
        ended_why: verdict.why,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.id);
    return NextResponse.json({
      sessionId: session.id,
      round,
      status: verdict.status,
      why: verdict.why,
      files: [],
      criteria: session.criteria,
      remaining: errors,
    });
  }

  const { output } = await providers.ai.generateStructuredOutput({
    systemInstructions: [
      RULES,
      "",
      "지금은 **고치는 판**이다. 유니티가 컴파일해서 아래 오류를 돌려보냈다.",
      "오류를 하나씩 원인까지 읽고, 고쳐야 하는 파일만 전체로 다시 내라.",
      "",
      "고치지 못하겠으면 억지로 지어내지 말고, 무엇이 막혔는지 note 에 적어라.",
      "지어낸 수정은 다음 판에 같은 오류로 돌아오고, 그러면 세션이 멈춘다.",
      "\n파일은 반드시 " + scope + " 아래에만 쓴다.",
      versionNote,
      knowledge ? "\n이 회사가 아는 것:\n" + knowledge : "",
    ].join("\n"),
    input: [
      "만들려는 것: " + session.want,
      "\n지금까지 " + round + "판 돌았다.",
      prev.length
        ? "\n지난 판들:\n" +
          prev
            .slice()
            .reverse()
            .map(
              (r) =>
                r.round +
                "판: " +
                (r.note ?? "") +
                " (낸 파일: " +
                (r.files ?? []).map((f) => f.path).join(", ") +
                ")",
            )
            .join("\n")
        : "",
      "\n이번에 돌아온 컴파일 오류:\n" +
        errors.map((e) => e.file + "(" + e.line + "): " + e.message).join("\n"),
      Array.isArray(b.project) && b.project.length
        ? "\n지금 프로젝트에 있는 파일:\n" +
          (b.project as { path: string; contents: string }[])
            .map((f) => "--- " + f.path + "\n" + f.contents)
            .join("\n\n")
        : "",
    ].join("\n"),
    schema: roundSchema,
    schemaName: "unity_vibe_round",
    maxTokens: 32000,
    tier: "judgment",
  });

  const kept = output.files.filter((f) => insideScope(f.path, scope));
  const refused = output.files.filter((f) => !insideScope(f.path, scope));
  const next = round + 1;

  await db
    .from("unity_sessions")
    .update({ round: next, updated_at: new Date().toISOString() })
    .eq("id", session.id);
  await db.from("unity_rounds").insert({
    session_id: session.id,
    round: next,
    files: kept.map((f) => ({ path: f.path, purpose: f.purpose })),
    note: output.note,
  });

  return NextResponse.json({
    sessionId: session.id,
    round: next,
    status: "running",
    scope,
    files: kept,
    refused: refused.map((f) => f.path),
    note: output.note,
    criteria: session.criteria,
  });
}
