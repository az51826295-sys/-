import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { blockedBySpendLimit } from "@/lib/costs/allowance";
import { meterProviders } from "@/lib/costs/meter";
import { defaultProviders } from "@/lib/execution/shared";
import { retrieveCompanyKnowledge, renderCompanyKnowledge } from "@/lib/knowledge/retrieval";
import { decide, fingerprint, insideScope, type CompileError } from "@/lib/unity/progress";
import { planUnitySession } from "@/lib/unity/plan";

/**
 * 유니티와 **돌면서** 만든다.
 *
 * `/api/unity/build` 는 한 번 만들어 주고 끝났다. 오류가 나면 사람이 다른 창에
 * 옮겨 붙여야 했고, 그건 협업이 아니라 창구 두 개였다.
 *
 * 여기서는 판이 이어진다: 설계한다 → 몇 개씩 낸다 → 유니티가 컴파일한다 →
 * 오류가 돌아온다 → 고쳐 낸다. 우리는 여전히 **아무 코드도 실행하지 않는다.**
 * 컴파일은 유니티가 하고, 우리는 그 결과만 읽는다.
 *
 * **왜 나눠 내는가.** 처음에는 한 번의 요청에 게임 전체를 내라고 했는데,
 * 게임만 해지면 그 한 번이 몇 분을 넘겨 중간의 프록시가 먼저 끊는다. 답이
 * 다 만들어졌는데도 받지 못하고, 돈은 이미 나갔다. 그래서 설계(목록)는 짧게
 * 한 번, 내용은 두 개씩 나눠 받는다.
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

/** 고치는 판을 무한히 돌리지 않는다. 여기서 멈추고 사람에게 넘긴다. */
const MAX_ROUNDS = 6;

/**
 * 한 번에 내용까지 받아 오는 파일 수.
 *
 * 크게 잡으면 요청 하나가 길어져 끊기고, 작게 잡으면 왕복이 늘어 느려진다.
 * 둘 중 끊기는 쪽이 더 나쁘다 — 끊기면 만든 것을 통째로 버리기 때문이다.
 */
const FILES_PER_CALL = 2;

const filesSchema = z.object({
  files: z.array(
    z.object({ path: z.string(), contents: z.string(), purpose: z.string() }),
  ),
  /** 이 판에 무엇을 왜 했는지 한 줄. 사람이 읽고 틀렸다고 말할 수 있어야 한다. */
  note: z.string(),
});

const RULES = [
  "너는 유니티 C# 스크립트를 쓴다. 유니티가 네 코드를 몇 초 뒤에 컴파일하고,",
  "오류는 그대로 너에게 돌아온다.",
  "",
  "- 파일은 **전체를 낸다.** 생략 표시로 줄이면 붙일 수가 없다.",
  "- 클래스 이름과 파일 이름을 맞춘다 — 어긋나면 컴포넌트를 못 붙인다.",
  "- 없는 패키지에 의존하지 마라. 기본 유니티로 되는 범위에서 쓴다.",
  "- 잴 수 없는 것(재미, 손맛)은 기준인 척하지 마라.",
  "",
  "**사람은 에디터를 열지 않는다.** 씬에 물체를 끌어다 놓아 줄 사람이 없으니,",
  "씬도 코드가 지어야 한다. 씬을 만들어 저장하는 에디터 정적 메서드를 하나 쓰고",
  "(에디터 전용이라 Editor/ 폴더 아래에 둔다) 그 온전한 이름을 sceneMethod 에",
  "적어라. 그 메서드는:",
  "- 씬을 새로 만들고 필요한 GameObject 와 컴포넌트를 코드로 붙인다,",
  "- 그림 파일이 없으면 코드로 만든 Texture2D 로 때운다 — 없는 파일을 참조하면",
  "  씬은 만들어져도 화면이 비어 있고, 그건 컴파일로는 안 잡힌다,",
  "- 카메라와 조명도 직접 만든다. 빈 씬에는 아무것도 없다,",
  "- 씬을 저장하고 EditorBuildSettings.scenes 에 넣는다,",
  "- **두 번 불려도 같은 결과**여야 한다. 부를 때마다 물체가 쌓이면, 두 번째",
  "  판부터 씬이 조용히 망가진다.",
].join("\n");

type Planned = { path: string; purpose: string; written: boolean };

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
    giveUp?: unknown;
    why?: unknown;
    want?: unknown;
    scope?: unknown;
    unityVersion?: unknown;
    errors?: unknown;
    project?: unknown;
    packages?: unknown;
  };

  const errors: CompileError[] = Array.isArray(b.errors)
    ? (b.errors as CompileError[])
        .filter(
          (e) => e && typeof e.message === "string" && typeof e.file === "string",
        )
        // 오류가 백 개 나도 원인은 대개 몇 개다. 다 실으면 요청이 오류로만 찬다.
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
  /**
   * 이 프로젝트에 **실제로 깔린 것**.
   *
   * 로키가 `UnityEngine.UI` 를 쓴 코드를 냈는데 그 패키지가 없어서 오류 16개가
   * 났고, 로키는 패키지를 못 깔아서 코드만 고치다 멈췄다 — 고칠 수 없는 것을
   * 고치려 한 것이다. 무엇이 있는지 먼저 알려 주면 없는 것을 쓰지 않는다.
   */
  const packageNote = Array.isArray(b.packages) && b.packages.length
    ? "\n\n이 프로젝트에 깔린 패키지(**여기 없는 것은 쓸 수 없다**):\n" +
      (b.packages as string[]).map((p) => "- " + p).join("\n") +
      "\n없는 패키지가 필요하면 그걸 쓰는 코드를 내지 말고, 사람이 깔아야 " +
      "한다고 setup 에 적어라. 네가 못 까는 것을 쓴 코드는 고칠 수 없는 오류로 " +
      "돌아오고, 판만 돌다 멈춘다."
    : "";

  const projectNote = Array.isArray(b.project) && b.project.length
    ? "\n지금 프로젝트에 있는 파일:\n" +
      (b.project as { path: string; contents: string }[])
        .map((f) => "--- " + f.path + "\n" + f.contents)
        .join("\n\n")
    : "";

  // ── 심부름꾼이 포기했다고 알려 온다 ─────────────────────────
  //
  // 이게 없으면 **돈이 새는 구멍**이 하나 열린다. 심부름꾼이 중간에 막혀
  // 나가도 세션은 'running' 으로 남고, 대기 중인 러너가 20초 뒤에 그것을 또
  // 집어 간다. 못 하는 일을 영원히 다시 시도하면서 판마다 값을 치른다.
  //
  // 서버의 멈추는 규칙(같은 오류 두 판)은 **컴파일까지 갔을 때만** 걸린다.
  // 쓰는 판에서 막히면 거기에 안 걸리므로, 포기했다는 말은 이쪽에서 와야 한다.
  if (typeof b.sessionId === "string" && b.sessionId && b.giveUp === true) {
    const why =
      typeof b.why === "string" && b.why.trim()
        ? b.why.trim()
        : "심부름꾼이 더 못 가고 멈췄습니다.";
    // 없는 세션에도 "멈췄다"고 답하지 않는다. 아무것도 안 멈췄는데 멈췄다고
    // 하면, 심부름꾼은 치웠다고 믿고 나가고 그 일은 계속 대기열에 남는다.
    const { data: stopped } = await db
      .from("unity_sessions")
      .update({ status: "stopped", ended_why: why, updated_at: new Date().toISOString() })
      .eq("id", b.sessionId)
      .eq("company_id", companyId)
      .select("id");
    if (!stopped?.length) {
      return NextResponse.json({ error: "그런 세션이 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ sessionId: b.sessionId, status: "stopped", why });
  }

  // ── 설계: 무엇을 만들 것인지 목록만 ──────────────────────────
  //
  // 설계는 대화창에서도 시작될 수 있어서 `lib/unity/plan.ts` 에 있다. 두 곳에
  // 같은 코드를 두면 한쪽만 고치는 날이 오고, 그러면 창구마다 다른 회사가 된다.
  if (typeof b.sessionId !== "string" || !b.sessionId) {
    const want = typeof b.want === "string" ? b.want.trim() : "";
    if (want.length < 5) {
      return NextResponse.json(
        { error: "무엇을 만들지 적어 주십시오." },
        { status: 400 },
      );
    }

    const made = await planUnitySession({
      db,
      providers,
      companyId,
      want,
      scope: typeof b.scope === "string" ? b.scope : undefined,
      unityVersion:
        typeof b.unityVersion === "string" ? b.unityVersion : undefined,
      project: Array.isArray(b.project)
        ? (b.project as { path: string; contents: string }[])
        : undefined,
    });
    if ("error" in made) {
      return NextResponse.json({ error: made.error }, { status: 422 });
    }

    return NextResponse.json({
      sessionId: made.sessionId,
      round: 1,
      status: "running",
      // 아직 컴파일할 때가 아니다. 목록만 있고 내용이 없다.
      action: "write_more",
      scope: made.scope,
      title: made.title,
      criteria: made.criteria,
      droppedCriteria: made.droppedCriteria,
      setup: made.setup,
      humanGate: made.humanGate,
      sceneMethod: made.sceneMethod,
      plan: made.planned.map((f) => f.path),
      files: [],
      refused: made.refused,
      note: made.note,
    });
  }

  // ── 이어지는 판 ──────────────────────────────────────────────
  const { data: session } = await db
    .from("unity_sessions")
    .select("id, want, scope, criteria, scene_method, plan, round, status")
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
  const plan = (session.plan ?? []) as Planned[];
  const remainingPlan = plan.filter((f) => !f.written);

  // ── 내용을 몇 개씩 낸다 ─────────────────────────────────────
  //
  // 설계도에 아직 안 쓴 파일이 남아 있으면 컴파일할 때가 아니다. 여기서
  // `decide()` 를 부르면 오류가 없다는 이유로 "통과"가 나오는데, 정작 파일은
  // 반밖에 없다 — 아무것도 안 만들고 성공했다고 말하는 셈이다.
  if (remainingPlan.length > 0 && errors.length === 0) {
    /**
     * 한 판에 파일 몇 개를 낼지는 **해 보고 줄인다.**
     *
     * 두 개를 청했다가 출력 한도에 잘려 500 이 났다. 씬 빌더처럼 큰 파일이
     * 끼면 둘이 안 들어간다. 그런데 파일 크기는 내 보기 전에는 모른다 —
     * 그래서 미리 하나씩만 청하면 작은 파일들에서 왕복만 두 배가 된다.
     *
     * 잘렸다는 것은 "이 묶음이 너무 컸다"는 **측정값**이다. 그때만 줄인다.
     */
    const ask = (files: Planned[], maxTokens: number) =>
      providers.ai.generateStructuredOutput({
      systemInstructions: [
        RULES,
        "",
        "지금은 **쓰는 판**이다. 아래에 적힌 파일만 내라. 다른 파일은 내지 마라 —",
        "나머지는 다음 판에 받는다.",
        "",
        "설계도 전체(무엇이 어디에 있을지)를 보고 쓰되, 아직 안 쓴 파일의 내용을",
        "가정하지 말고 **설계도에 적힌 역할대로** 부르면 된다.",
        `\n파일은 반드시 ${scope} 아래에 둔다.`,
        versionNote,
        packageNote,
        session.scene_method
          ? `\n씬을 짓는 메서드는 ${session.scene_method} 다.`
          : "",
        knowledge ? "\n이 회사가 아는 것:\n" + knowledge : "",
      ].join("\n"),
      input: [
        "만들려는 것: " + session.want,
        "\n설계도 전체:",
        ...plan.map(
          (f) => `- ${f.path} — ${f.purpose}${f.written ? " (이미 씀)" : ""}`,
        ),
        "\n이번에 낼 파일:",
        ...files.map((f) => `- ${f.path} — ${f.purpose}`),
        projectNote,
      ].join("\n"),
      schema: filesSchema,
      schemaName: "unity_vibe_files",
      maxTokens,
      tier: "judgment",
    });

    let batch = remainingPlan.slice(0, FILES_PER_CALL);
    let output;
    try {
      ({ output } = await ask(batch, 16000));
    } catch (error) {
      const truncated =
        error instanceof Error && error.message === "MODEL_OUTPUT_TRUNCATED";
      if (!truncated || batch.length === 1) throw error;
      // 잘렸다는 것은 "이 묶음이 너무 컸다"는 측정값이다. 그때만 줄인다.
      batch = batch.slice(0, 1);
      ({ output } = await ask(batch, 24000));
    }

    const wanted = new Set(batch.map((f) => f.path));
    const kept = output.files.filter(
      (f) => insideScope(f.path, scope) && wanted.has(f.path),
    );
    const extra = output.files
      .filter((f) => !wanted.has(f.path))
      .map((f) => f.path);

    // 낸 것만 "썼다"로 표시한다. 안 내고 넘어간 파일을 표시해 버리면 그 파일은
    // 영영 안 만들어지고, 컴파일에서 "그런 클래스 없다"로만 나타난다.
    const done = new Set(kept.map((f) => f.path));
    const nextPlan = plan.map((f) =>
      done.has(f.path) ? { ...f, written: true } : f,
    );
    const stillLeft = nextPlan.filter((f) => !f.written).length;

    if (kept.length === 0) {
      return NextResponse.json({
        sessionId: session.id,
        round,
        status: "running",
        action: "write_more",
        scope,
        files: [],
        note: "이번 판에 쓸 수 있는 파일이 나오지 않았습니다. 다시 청합니다.",
        left: stillLeft,
      });
    }

    await db
      .from("unity_sessions")
      .update({ plan: nextPlan, updated_at: new Date().toISOString() })
      .eq("id", session.id);

    return NextResponse.json({
      sessionId: session.id,
      round,
      status: "running",
      // 남은 것이 없으면 이제 컴파일할 때다.
      action: stillLeft > 0 ? "write_more" : "compile",
      scope,
      files: kept,
      // 시키지 않은 파일을 낸 것은 버리되, 버린 사실을 말한다.
      refused: extra,
      note: output.note,
      criteria: session.criteria,
      sceneMethod: session.scene_method,
      left: stillLeft,
    });
  }

  // ── 고치는 판: 오류를 받는다 ────────────────────────────────
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
      action: "done",
      why: verdict.why,
      files: [],
      criteria: session.criteria,
      sceneMethod: session.scene_method,
      remaining: errors,
    });
  }

  const { output } = await providers.ai.generateStructuredOutput({
    systemInstructions: [
      RULES,
      "",
      "지금은 **고치는 판**이다. 유니티가 컴파일해서 아래 오류를 돌려보냈다.",
      "오류를 하나씩 원인까지 읽고, 고쳐야 하는 파일만 전체로 다시 내라.",
      "바꿀 필요가 없는 파일은 내지 마라 — 그대로 다시 내면 받는 쪽이 무엇이",
      "바뀌었는지 모른다.",
      "",
      "고치지 못하겠으면 억지로 지어내지 말고, 무엇이 막혔는지 note 에 적어라.",
      "지어낸 수정은 다음 판에 같은 오류로 돌아오고, 그러면 세션이 멈춘다.",
      `\n파일은 반드시 ${scope} 아래에만 쓴다.`,
      versionNote,
      knowledge ? "\n이 회사가 아는 것:\n" + knowledge : "",
    ].join("\n"),
    input: [
      "만들려는 것: " + session.want,
      `\n지금까지 ${round}판 돌았다.`,
      prev.length
        ? "\n지난 판들:\n" +
          prev
            .slice()
            .reverse()
            .map(
              (r) =>
                `${r.round}판: ${r.note ?? ""} (낸 파일: ${(r.files ?? [])
                  .map((f) => f.path)
                  .join(", ")})`,
            )
            .join("\n")
        : "",
      "\n이번에 돌아온 오류:\n" +
        errors.map((e) => `${e.file}(${e.line}): ${e.message}`).join("\n"),
      projectNote,
    ].join("\n"),
    schema: filesSchema,
    schemaName: "unity_vibe_fix",
    maxTokens: 16000,
    tier: "judgment",
  });

  const kept = output.files.filter((f) => insideScope(f.path, scope));
  const refused = output.files
    .filter((f) => !insideScope(f.path, scope))
    .map((f) => f.path);
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
    action: "compile",
    scope,
    files: kept,
    refused,
    note: output.note,
    criteria: session.criteria,
    sceneMethod: session.scene_method,
  });
}
