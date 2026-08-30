import { z } from "zod";
import type { Providers, Supabase } from "@/lib/execution/shared";
import type { CompileError } from "@/lib/unity/progress";

/**
 * 유니티 고리가 세션을 넘어 들고 다니는 것.
 *
 * 이 고리는 판 안에서는 배운다 — 오류가 돌아오면 읽고 고친다. 그런데 세션이
 * 끝나면 그게 사라져서, 낮에 스스로 고친 `Arial.ttf` 오류를 저녁에 똑같이 다시
 * 냈다. 같은 병을 두 번 앓으면서 두 번 돈을 낸 것이고, 판마다 고쳐 내는 능력은
 * 그걸 못 막는다. 고친 것이 어디에도 안 적히기 때문이다.
 *
 * 그래서 여기서 두 가지를 한다: **통과한 판에서 교훈을 줍고**, 다음 세션의
 * 프롬프트에 **그걸 도로 실어 준다.**
 *
 * ## 무엇을 증거로 삼는가
 *
 * 모델이 "고쳤다"고 쓴 note 는 증거가 아니다. 지어낸 수정도 똑같이 자신 있게
 * 그렇게 쓴다. 여기서 증거로 인정하는 것은 하나뿐이다 — **지난 판에 있던 오류가
 * 이번 판에 0 으로 돌아왔다.** 컴파일러가 대신 재 준 것만 적는다.
 *
 * 부분적으로 줄어든 것은 안 줍는다. 하나가 고쳐져서 사라진 것과, 앞의 오류가
 * 컴파일을 먼저 끊어서 뒤가 안 보이는 것을 구분할 수 없기 때문이다. 이 고리에서
 * 이미 여섯 번 밟은 병이 그것이다 — **못 본 것과 없는 것을 구분하지 않으면,
 * 못 볼수록 잘 통과한다.**
 *
 * ## 왜 회사 지식에 넣지 않는가
 *
 * `organization_knowledge` 는 모든 직원이 모든 일에 여덟 개까지 읽어 가는
 * 자리다(`MAX_KNOWLEDGE_PER_EXECUTION`). 유니티 6 에 `Arial.ttf` 가 없다는
 * 사실을 거기 넣으면, 새것부터 실리므로 회사가 실제로 정한 것들이 컴파일러
 * 잔소리에 밀려난다 — 글 쓰는 직원이 그걸 읽고 있게 된다. 연장에 대해 아는
 * 것은 그 연장을 쓰는 고리 옆에 둔다.
 */

/** 한 세션에서 줍는 교훈의 최대. 대개 0~1 개가 정상이다. */
const MAX_HARVEST = 3;

/** 한 판의 프롬프트에 실리는 교훈의 최대. 회사 지식과 같은 이유로 좁게 잡는다. */
const MAX_PER_ROUND = 6;

export type UnityLesson = {
  signature: string;
  symptom: string;
  lesson: string;
  seen: number;
};

/**
 * 오류 하나의 지문. **파일 이름도 줄번호도 넣지 않는다.**
 *
 * `progress.fingerprint` 와 목적이 다르다. 저쪽은 "이번 판이 지난 판과 같은가"를
 * 보는 것이라 파일이 붙어 있어야 하고, 이쪽은 "전에 앓던 그 병인가"를 보는
 * 것이라 파일이 붙으면 안 된다 — 같은 API 를 다른 파일에서 잘못 쓰면 그건 같은
 * 병이다.
 */
/** 윈도우 경로와 유니티 경로를 같은 것으로 본다. `progress.ts` 와 같은 이유. */
const BACKSLASH = String.fromCharCode(92);

export function lessonSignature(message: string): string {
  return (
    message
      .split(BACKSLASH)
      .join("/")
      // 메시지가 제 위치를 다시 달고 오는 경우가 있다(씬 빌더가 던진 예외처럼).
      // 그걸 그대로 두면 같은 병이 파일마다 다른 지문이 되어, 두 번째 파일에서
      // 또 데인다 — 이 표가 막으려던 바로 그 일이다.
      .replace(/^\s*[\w .\-/]+\.cs(\(\s*\d+\s*,\s*\d+\s*\))?\s*:\s*/i, "")
      .replace(/^\s*error\s+/i, "")
      .replace(/\(\s*\d+\s*,\s*\d+\s*\)/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .slice(0, 300)
  );
}

/**
 * 이 회사가 유니티에서 이미 데인 것.
 *
 * 지금 돌아온 오류와 지문이 맞는 것을 먼저 싣는다. 나머지 자리는 **다시 밟은
 * 횟수가 많은 것**부터 채운다 — 여러 번 돌아온 병이 다음에도 돌아올 병이다.
 * 쓰는 판에는 오류가 없으므로 뒤쪽만 실린다. 그쪽이 사실 더 중요한 자리다:
 * 오류가 난 뒤에 알려 주는 것보다 나기 전에 막는 것이 한 판 싸다.
 */
export async function retrieveUnityLessons(
  db: Supabase,
  companyId: string,
  errors: CompileError[] = [],
): Promise<UnityLesson[]> {
  const { data } = await db
    .from("unity_lessons")
    .select("signature, symptom, lesson, seen")
    .eq("company_id", companyId)
    .order("seen", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(40);

  const rows = (data ?? []) as UnityLesson[];
  if (rows.length === 0) return [];

  const hit = new Set(errors.map((e) => lessonSignature(e.message)));
  const matched = rows.filter((r) => hit.has(r.signature));
  const rest = rows.filter((r) => !hit.has(r.signature));
  return [...matched, ...rest].slice(0, MAX_PER_ROUND);
}

/** 프롬프트에 붙일 모양. 없으면 빈 문자열 — 빈 제목만 붙는 것을 막는다. */
export function renderUnityLessons(lessons: UnityLesson[]): string {
  if (lessons.length === 0) return "";
  return [
    "",
    "이 회사가 유니티에서 이미 데인 것 (컴파일이 통과해서 확인된 것만):",
    ...lessons.map(
      (l) =>
        `- ${l.symptom}${l.seen > 1 ? ` (${l.seen}번 밟음)` : ""} → ${l.lesson}`,
    ),
    "",
    "이건 이 프로젝트에서 실제로 돌려 본 결과다. 여기 적힌 것을 다시 하지 마라.",
    "다만 지금 만들려는 것과 상관없으면 억지로 끼워 맞추지도 마라.",
  ].join("\n");
}

const harvestSchema = z.object({
  lessons: z.array(
    z.object({
      /** 몇 번 오류에서 나온 교훈인지. 증상은 우리가 그 번호로 붙인다. */
      errorIndex: z.number(),
      /** 다음에 어떻게 쓰라는 것. 한두 문장. */
      lesson: z.string(),
    }),
  ),
});

/**
 * 통과한 판에서 교훈을 줍는다.
 *
 * 실패해도 고리를 세우지 않는다. 이건 곁가지고, 여기서 던지면 **정작 게임이
 * 다 만들어진 판이 오류로 끝난다** — 배우려다 본 일을 깨는 것은 남는 장사가
 * 아니다.
 */
export async function harvestUnityLessons(args: {
  db: Supabase;
  providers: Providers;
  companyId: string;
  sessionId: string;
  round: number;
  /** 지난 판에 있었고 이번 판에 사라진 오류. */
  fixed: CompileError[];
  /** 그것을 사라지게 한 판이 낸 파일들. */
  files: { path: string; purpose: string }[];
  /** 그 판이 무엇을 왜 했다고 적었는지. */
  note: string | null;
  unityVersion: string | null;
}): Promise<number> {
  const { fixed } = args;
  if (fixed.length === 0) return 0;

  try {
    const { output } = await args.providers.ai.generateStructuredOutput({
      systemInstructions: [
        "유니티 컴파일 오류가 하나의 수정으로 사라졌다. 다음 세션이 **같은",
        "오류를 처음부터 내지 않도록** 짧은 교훈으로 옮겨 적어라.",
        "",
        "- 다음에 코드를 쓸 때 바로 쓸 수 있는 말로 적는다. 예: \"유니티 6 에는",
        "  Arial.ttf 가 없다. 기본 폰트는 LegacyRuntime.ttf 로 부른다.\"",
        "- **이 게임에만 해당하는 것은 적지 마라.** 오타를 고쳤다거나 이 클래스의",
        "  변수 이름을 맞췄다는 것은 다음 세션에 아무 쓸모가 없고, 자리만 차지해서",
        "  진짜 교훈을 밀어낸다.",
        "- 무엇 때문에 사라졌는지 확실하지 않으면 그 오류는 **빼라.** 추측을",
        "  적으면 다음 세션이 그 추측을 사실로 읽는다.",
        `- 많아야 ${MAX_HARVEST} 개. 대개는 0 개나 1 개가 맞다.`,
      ].join("\n"),
      input: [
        args.unityVersion ? `유니티 버전: ${args.unityVersion}` : "",
        "\n사라진 오류:",
        ...fixed.map(
          (e, i) => `${i}. ${e.file}(${e.line}): ${e.message}`,
        ),
        "\n그것을 사라지게 한 판이 낸 파일:",
        ...args.files.map((f) => `- ${f.path} — ${f.purpose}`),
        args.note ? `\n그 판이 적은 것: ${args.note}` : "",
      ].join("\n"),
      schema: harvestSchema,
      schemaName: "unity_lessons",
      maxTokens: 1200,
      // 답이 입력 안에 있다 — 오류와 수정이 둘 다 실려 있고, 그중에서 고르는
      // 일이다. 판단 등급으로 올릴 이유가 없다.
      tier: "verification",
    });

    const picked = output.lessons
      .filter((l) => fixed[l.errorIndex] && l.lesson.trim().length > 0)
      .slice(0, MAX_HARVEST);

    let written = 0;
    for (const l of picked) {
      const source = fixed[l.errorIndex];
      const signature = lessonSignature(source.message);
      const { error } = await args.db.from("unity_lessons").insert({
        company_id: args.companyId,
        signature,
        symptom: source.message.replace(/\s+/g, " ").trim().slice(0, 300),
        lesson: l.lesson.trim().slice(0, 500),
        unity_version: args.unityVersion,
        session_id: args.sessionId,
        round: args.round,
      });

      // 이미 있는 지문이면 덮어쓰지 않고 **횟수만 올린다.** 먼저 적힌 것도
      // 컴파일로 확인된 것이고, 다시 밟았다는 사실 자체가 따로 값어치가 있다 —
      // 그 숫자가 올라가면 적어 둔 교훈이 안 듣는다는 뜻이다.
      if (error) {
        if (error.code !== "23505") continue;
        const { data: existing } = await args.db
          .from("unity_lessons")
          .select("seen")
          .eq("company_id", args.companyId)
          .eq("signature", signature)
          .maybeSingle();
        await args.db
          .from("unity_lessons")
          .update({
            seen: ((existing?.seen as number) ?? 1) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("company_id", args.companyId)
          .eq("signature", signature);
        continue;
      }
      written += 1;
    }
    return written;
  } catch (e) {
    console.warn(
      "유니티 교훈을 줍지 못했습니다 — 세션은 그대로 둡니다.",
      e instanceof Error ? e.message : e,
    );
    return 0;
  }
}
