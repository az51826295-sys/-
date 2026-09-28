/**
 * **로키가 자기 한계를 안다** (226회차 2026-09-27).
 *
 * 사장님: *"로키가 없는게 하나있서 그건 한계야 어디까지 되는지 알아야해."*
 *
 * "이거 어디까지 돼?" 에 답할 근거가 대화 프롬프트에 없었다. 근거가 없으면 모델은 지어낸다 —
 * 09-16 에 **있는 v2 를 없다고** 했고, 오늘 나는 "잘림 0건" 을 "없다" 로 읽었다.
 * 같은 병이다: **모르는 것을 모른다고 말할 자리가 없었다.**
 *
 * 그래서 한계를 주장하지 않고 **장부에서 센 사실**을 싣는다. 세 가지를 가른다:
 *   · **해 봤고 됐다** — 실제로 만들어진 최대치. 사실이다.
 *   · **끝까지 못 간 것** — 취소된 수와 이유.
 *   · **안 해 봤다** — 등록부에 있는데 기록에 없는 것. **"안 된다" 가 아니라 "모른다" 다.**
 *
 * **최대치는 한계가 아니다.** 더 큰 것을 시도한 적이 없으면 벽은 그보다 뒤에 있다.
 * 그 말을 프롬프트에 같이 넣는다 — 안 넣으면 모델이 최대치를 상한처럼 말한다.
 *
 * 값: 대화마다 세면 느리다. 회사별로 **10분 동안 기억**해 둔다.
 */
import type { Supabase } from "@/lib/execution/shared";

type Limits = { text: string; at: number };
const 기억 = new Map<string, Limits>();
const 십분 = 10 * 60 * 1000;

/**
 * 종류마다 "크기" 를 읽는 법. 없으면 그 종류는 크기를 안 적는다 — 지어내지 않는다.
 *
 * **여기 한 곳에만 적는다.** 리포트(`engine/tools/limits_look.mts`)가 이것을 import 한다 —
 * 226회차에 벤치가 스키마를 따로 적어 두어 새 칸을 아예 못 잰 일이 있었다.
 *
 * 09-28: 발표 자료·그림·도트·시장 조사 넷이 "크기는 기록에서 못 읽는다" 였다.
 * **그건 벽이 아니라 눈이 없는 것이다** — 뛰어넘기 전에 읽는 칸부터 만든다.
 * 칸은 있었고 내가 엉뚱한 이름을 보고 있었다(slides 는 `outline.slides`, 그림은 `uploadReady.images`).
 */
const 배열길이 = (v: unknown): number | null => (Array.isArray(v) ? v.length || null : null);
const 속 = (c: Record<string, unknown>, a: string, b: string): unknown =>
  (c[a] as Record<string, unknown> | null | undefined)?.[b];

export const 크기: Record<string, { 이름: string; 값: (c: Record<string, unknown>) => number | null }[]> = {
  app_build: [
    { 이름: "파일", 값: (c) => (Array.isArray(c.files) ? c.files.length : null) },
    // 09-28: 리포트에 "고침 바퀴: 읽을 수 있는 줄이 없다" 로 남아 있었다. **칸은 있었다** —
    // `loop.rounds` 가 **배열**인데 내가 숫자로 읽었다(`Number([])` = 0 → null).
    // 그걸 파다가 `stoppedBy: "no_run"` 을 보고 "돌려 보지도 않는다" 고 과하게 놀랐는데,
    // 세어 보니 200판 중 83판이 실제로 돌았고 no_run 은 13판(6.5%)이었다.
    // **놀라기 전에 세는 것이 먼저다.**
    { 이름: "고침 바퀴", 값: (c) => 배열길이(속(c, "loop", "rounds")) },
    // 09-28: 크기 읽는 법을 여기 한 곳으로 모을 때 **리포트에만 있던 이 자를 잃었다**(최대 189).
    // 한 곳으로 모으는 것은 맞지만, 옮길 때 **양쪽 목록을 대 봐야** 조용히 빠지지 않는다.
    { 이름: "확인 항목", 값: (c) => 배열길이(c.criteria) },
    { 이름: "코드 글자", 값: (c) => (Array.isArray(c.files) ? (c.files as { contents?: string }[]).reduce((s, f) => s + (f.contents?.length ?? 0), 0) || null : null) },
  ],
  video: [
    { 이름: "길이(초)", 값: (c) => (typeof c.total === "number" ? Math.round(c.total) : null) },
    { 이름: "장면", 값: (c) => (Array.isArray(c.durations) ? c.durations.length : null) },
  ],
  analysis: [
    { 이름: "출처", 값: (c) => 배열길이(c.sources) },
    // 09-28: 못 읽은 링크 수도 본다. 출처 6개를 받아도 넷이 빈손이면 실제로 읽은 것은 둘이다.
    { 이름: "못 읽은 링크", 값: (c) => 배열길이(c.unreadable) },
    { 이름: "인용", 값: (c) => (Array.isArray(c.claims) ? c.claims.length : null) },
  ],
  // 09-28: **여기서 내 표가 거짓말을 했다.** `clips` 를 "조각" 으로 읽어 "조각 최대 2" 라고 적었는데,
  // `clips` 는 **애니메이션 동작 클립**(`["idle"]`)이다. 조각(맨몸·투구·갑옷)은 이 칸이 아니다.
  //
  // **나눈 조각 수는 장부에 안 남는다** — `pendingPieces` 는 *남은* 것이고 하나씩 지워진다.
  // 그러니 여기서는 **적지 않는다.** 틀린 숫자를 대는 것이 "모른다" 보다 나쁘다.
  // (조각 수를 재려면 이어달리기 사슬을 세는 칸을 결과물에 새로 남겨야 한다.)
  mesh_assets: [
    { 이름: "동작 클립", 값: (c) => 배열길이(c.clips) },
    // 09-28 부터 나눈 판이 총 조각 수를 남긴다(`pieceCount`). 그 전 판에는 이 칸이 없으므로
    // 처음에는 "읽을 수 있는 줄이 없다" 로 나온다 — **없는 것이 아니라 아직 안 쌓인 것이다.**
    { 이름: "나눈 조각", 값: (c) => (typeof c.pieceCount === "number" ? c.pieceCount || null : null) },
  ],
  document: [{ 이름: "항목", 값: (c) => 배열길이(c.items) }],
  // ── 09-28 에 눈을 붙인 넷 ──────────────────────────────────────
  slides: [
    { 이름: "장", 값: (c) => 배열길이(속(c, "outline", "slides")) },
    { 이름: "주문한 장", 값: (c) => (typeof c.asked === "number" ? c.asked || null : null) },
  ],
  // 그림은 `uploadReady.images` 가 **배열이 아니라 개수(숫자)** 다. 배열로 읽으려 해서 못 봤다 —
  // 칸이 없던 게 아니고 내가 꼴을 잘못 알았다. 해시태그 수도 같이 읽는다(인스타가 거는 한도가 있다).
  image: [
    { 이름: "장", 값: (c) => (typeof 속(c, "uploadReady", "images") === "number" ? (속(c, "uploadReady", "images") as number) || null : 배열길이(속(c, "uploadReady", "images"))) },
    { 이름: "해시태그", 값: (c) => 배열길이(속(c, "plan", "hashtags")) },
  ],
  game_assets: [{ 이름: "후보", 값: (c) => 배열길이(c.candidates) }],
  market_research_report: [
    { 이름: "절", 값: (c) => 배열길이(c.sections) },
    { 이름: "다음 걸음", 값: (c) => 배열길이(c.recommendedNextSteps) },
  ],
};

const 한국말: Record<string, string> = {
  app_build: "앱·게임 만들기",
  video: "설명 영상",
  analysis: "자료·영상 분석",
  mesh_assets: "3D 모델",
  document: "문서",
  slides: "발표 자료",
  image: "그림·로고",
  game_assets: "도트 캐릭터",
  market_research_report: "시장 조사",
};

export async function limitsText(db: Supabase, companyId: string | null): Promise<string> {
  if (!companyId) return "";
  const 있는것 = 기억.get(companyId);
  if (있는것 && Date.now() - 있는것.at < 십분) return 있는것.text;

  try {
    const [{ data: ds, error: e1 }, { data: as, error: e2 }] = await Promise.all([
      db.from("deliverables").select("deliverable_type, content_json").eq("company_id", companyId).limit(1000),
      db.from("assignments").select("status, failure_reason").eq("company_id", companyId).limit(1000),
    ]);
    // 오류를 **읽는다.** 못 읽었으면 빈 글을 준다 — 0 을 "없다" 로 싣지 않는다.
    if (e1 || e2) {
      console.warn("[limits] 장부를 못 읽었다 — 한계는 안 싣는다:", e1?.message ?? e2?.message);
      return "";
    }
    const 결과물 = (ds ?? []) as { deliverable_type: string; content_json: Record<string, unknown> | null }[];
    const 업무 = (as ?? []) as { status: string; failure_reason: string | null }[];
    if (!결과물.length && !업무.length) return "";

    const 줄: string[] = [
      "## 네가 실제로 어디까지 해냈나 (장부에서 센 것)",
      "",
      "**이건 한계가 아니라 해낸 최대치다.** 더 큰 것을 시도한 적이 없으면 벽은 그보다 뒤에 있다.",
      "물으면 이 숫자를 대되 **\"여기까지 해 봤다\"** 라고 말하고, \"이게 최대다\" 라고 하지 마라.",
      "",
    ];

    const 종류 = [...new Set(결과물.map((d) => d.deliverable_type))];
    for (const t of 종류) {
      const ds2 = 결과물.filter((d) => d.deliverable_type === t);
      const 재기 = 크기[t];
      const 조각 = (재기 ?? [])
        .map((m) => {
          const vs = ds2.map((d) => m.값(d.content_json ?? {})).filter((x): x is number => typeof x === "number" && x > 0);
          return vs.length ? `${m.이름} 최대 ${Math.max(...vs).toLocaleString()}` : null;
        })
        .filter(Boolean);
      줄.push(
        `- ${한국말[t] ?? t}: ${ds2.length}번 만들었다` +
          (조각.length ? ` (${조각.join(" · ")})` : " (크기는 기록에서 못 읽는다)"),
      );
    }

    const 취소 = 업무.filter((a) => a.status === "cancelled").length;
    const 이유 = new Map<string, number>();
    for (const a of 업무) if (a.failure_reason) 이유.set(a.failure_reason.slice(0, 40), (이유.get(a.failure_reason.slice(0, 40)) ?? 0) + 1);
    const 흔한 = [...이유].sort((x, y) => y[1] - x[1]).slice(0, 3);
    줄.push("");
    줄.push(`- 끝까지 못 간 것: 업무 ${업무.length}건 중 취소 ${취소}건` + (흔한.length ? ` · 적힌 이유 ${흔한.map(([r, n]) => `${r}(${n})`).join(", ")}` : ""));
    줄.push("");
    줄.push(
      "**한 번도 안 해 본 것은 \"안 된다\" 가 아니라 \"모른다\" 다.** 위 목록에 없는 종류를 물으면" +
        " \"코드는 있는데 아직 해 본 적이 없어서 어디까지 되는지 모른다\" 고 말해라. 된다고도 안 된다고도 하지 마라.",
    );

    const text = 줄.join("\n");
    기억.set(companyId, { text, at: Date.now() });
    return text;
  } catch (e) {
    console.warn("[limits] 한계를 못 셌다:", e instanceof Error ? e.message : e);
    return "";
  }
}
