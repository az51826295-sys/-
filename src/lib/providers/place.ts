import { z } from "zod";
import type { AIProvider } from "./types";
import type { Supabase } from "@/lib/execution/shared";

/**
 * **어느 AI를 이 일에 앉힐 것인가 — 판단이 정한다** (152회차 09-16).
 *
 * 사장님 09-16: *"판단자 ai 잘 만들면 모든 에이아이를 적재적소에 쓰며 더 높은 효율을 낼 수 있다."*
 * 그리고 오늘 저녁: *"지금 판단 ai야?"* — 아니었다. 배치는 여전히 내가 손으로 적은 집합 하나였다:
 * `ECONOMY_TIERS = {conversation, routine, verification, judgment}`. 일이 무엇이든 판단 자리는 늘 싼 쪽부터.
 *
 * ## 무엇을 맡기고 무엇을 안 맡기는가
 *
 * 맡기는 것은 **자리 고르기 하나**다. 어떤 자리를 골라도 일은 돌아간다 — 값과 성질이 다를 뿐,
 * 화면이 깨지거나 답이 안 나오지 않는다(149회차 `look.ts` 와 같은 기준으로 고른 자리다).
 * 반대로 그림이 딸린 호출을 눈 없는 모델에 보내는 것 같은 **깨지는 선택은 난간이 막는다**(`safePlace`).
 *
 * ## 문이 아니다
 *
 * 이건 막는 자리가 아니라 **고르는 자리**다. 고르기를 못 하면 지금 하던 대로 간다(기본값).
 * 판단이 틀려도 일은 나온다 — 그래서 맡겨도 된다.
 *
 * ## 기계가 사실을 대고, 판단이 고른다
 *
 * 내 의견은 프롬프트에 안 들어간다. 들어가는 것은 **우리 장부에서 센 값**뿐이다(`placeFacts`):
 * 자리마다 몇 판 했고, 검사에 몇 번 떨어졌고, 사장님이 몇 번 수정 요청을 눌렀고, 판값이 얼마였나.
 * 105회차에 배운 것도 같이 댄다 — **싼 모델이 더 잘한 게 아니라 쉬운 일이 그쪽으로 갔던 것**이라는 것.
 */

/** 앉힐 수 있는 자리. **칸이 아니라 주소다** — 실제로 부를 수 있는 모델 이름이다. */
export const PLACES = {
  "deepseek-v4-pro": { vendor: "deepseek", out: 3.96, sees: false, note: "지금까지 판단 자리가 기본으로 가던 곳. 생각 모드." },
  "gpt-5": { vendor: "openai", out: 10, sees: true, note: "그림을 본다. 형식을 잘 지킨다." },
  "gpt-5-mini": { vendor: "openai", out: 2, sees: true, note: "제일 싸다. 지금까지 판단 자리로 불린 적은 없다(성적 기록도 없다)." },
  "gpt-6-astra": { vendor: "openai", out: 50, sees: true, note: "제일 비싸다(기본의 12배). 126회차: 실속 4~5배, 형식은 덜 미덥다." },
  // 171회차 09-18 모델 파악이 찾은 새 판들. 09-17 실제 고장(부호 두 줄)에서 셋 다 gpt-5 와 같은 답, 10배 빠름. 성적 기록은 그 한 판뿐.
  "gpt-5.6-luna": { vendor: "openai", out: 1.2, sees: true, note: "gpt-5 의 1/8 값. 고치는 판은 여기가 기본(172회차). 다른 일 성적은 아직 없다." },
  "gpt-5.6-terra": { vendor: "openai", out: 12, sees: true, note: "gpt-5 와 값이 비슷한 새 판(2026-06). 성적 기록 한 판." },
  "gpt-5.3-codex": { vendor: "openai", out: 14, sees: false, note: "코드 전용 판. 성적 기록 한 판(3초)." },
} as const;
export type Place = keyof typeof PLACES;
export const DEFAULT_PLACE: Place = "deepseek-v4-pro";
const isPlace = (s: string): s is Place => Object.prototype.hasOwnProperty.call(PLACES, s);

export const placeSchema = z.object({
  place: z.string().describe(`이 일을 앉힐 자리. ${Object.keys(PLACES).join(" / ")} 중 하나를 그대로 적는다.`),
  why: z.string().describe("왜 이 자리인지 한 줄. 사람이 읽고 틀렸다고 말할 수 있어야 한다."),
  risk: z.string().describe("이 선택이 틀렸다면 어떻게 틀릴지 한 줄. 모르면 '모르겠다'."),
});
export type Placement = z.infer<typeof placeSchema> & { place: Place; picked: boolean };

const SYS = [
  "너는 AI 사무실(로키)의 **배치 담당**이다. 들어온 일 하나를 읽고 **어느 모델 자리에 앉힐지** 정한다.",
  "",
  "고르는 기준은 네가 정한다. 다만 아래는 알고 골라라:",
  "- **값이 다르다.** 자리마다 출력 100만 토큰 값이 아래에 적혀 있다. 비싼 자리는 그만한 이유가 있어야 한다.",
  "- **쉬운 일이 싼 자리로 가면 성적이 좋아 보인다.** 우리 장부에서 실제로 그 착시가 있었다(작은 손질만 싼 자리로 갔다).",
  "  그러니 아래 성적표를 '모델의 실력' 으로 곧이 읽지 마라 — 어떤 일이 그 자리로 갔는지까지 같이 봐라.",
  "- **판이 적은 자리의 성적은 믿을 게 못 된다.** 10판 미만이면 거의 아무 말도 아니다.",
  "",
  "막는 자리가 아니다. 어느 자리를 골라도 일은 나온다 — 값과 성질이 다를 뿐이다.",
  "확신이 없으면 지금 쓰던 자리를 그대로 골라도 된다. 그게 정답일 때가 많다.",
].join("\n");

type Row = { model: string; n: number; bad: number; human: number; usd: number };

/**
 * **자리마다 우리가 실제로 겪은 것.** 의견 0, 전부 장부에서 센 값이다.
 *
 * 세는 것: 그 모델이 주로 돌린 실행 수 · 그중 검사에 떨어진 판 · **사장님이 수정 요청·버림을 누른 판** · 판당 값.
 * 사람 판정은 아직 0건일 수 있다(151회차) — 0이면 0이라고 적는다. 없는 것을 있는 척하지 않는다.
 */
export async function placeFacts(db: Supabase, companyId: string): Promise<string> {
  const [{ data: usage }, { data: dels }, { data: revs }] = await Promise.all([
    db.from("model_usage").select("model, cost_usd, work_execution_id").eq("company_id", companyId).limit(4000),
    db.from("deliverables").select("id, work_execution_id, v:content_json->verdict->>verdict").eq("company_id", companyId).limit(1000),
    db.from("deliverable_reviews").select("deliverable_id, decision").eq("company_id", companyId).limit(1000),
  ]);
  // 한 실행의 '주 모델' = 그 실행에서 값이 제일 큰 모델(105회차와 같은 셈).
  const perExec = new Map<string, Map<string, number>>();
  for (const u of (usage ?? []) as { model: string; cost_usd: number | string; work_execution_id: string | null }[]) {
    if (!u.work_execution_id) continue;
    const m = perExec.get(u.work_execution_id) ?? new Map<string, number>();
    m.set(u.model, (m.get(u.model) ?? 0) + Number(u.cost_usd ?? 0));
    perExec.set(u.work_execution_id, m);
  }
  const mainOf = new Map<string, { model: string; usd: number }>();
  for (const [ex, m] of perExec) {
    let best = { model: "", usd: -1 };
    let total = 0;
    for (const [mod, usd] of m) { total += usd; if (usd > best.usd) best = { model: mod, usd }; }
    if (best.model) mainOf.set(ex, { model: best.model, usd: total });
  }
  const humanBad = new Set(
    ((revs ?? []) as { deliverable_id: string; decision: string }[]).filter((r) => r.decision !== "approved").map((r) => r.deliverable_id),
  );
  const rows = new Map<string, Row>();
  for (const [, v] of mainOf) {
    const r = rows.get(v.model) ?? { model: v.model, n: 0, bad: 0, human: 0, usd: 0 };
    r.n++; r.usd += v.usd; rows.set(v.model, r);
  }
  for (const d of (dels ?? []) as { id: string; work_execution_id: string | null; v: string | null }[]) {
    const main = d.work_execution_id ? mainOf.get(d.work_execution_id) : null;
    if (!main) continue;
    const r = rows.get(main.model);
    if (!r) continue;
    if (d.v === "FAIL" || d.v === "PARTIAL") r.bad++;
    if (humanBad.has(d.id)) r.human++;
  }
  // 152회차: `execution_id` 라는 없는 열을 골라 **조용히 빈 사실**이 넘어갔다(오늘 세 번째다 — 없는 열은
  // 오류로 오고 data 는 null 이 된다). 빈손이면 빈손이라고 적는다. 지어내지 않는다.
  // 그림·3D 모델은 글 일을 앉힐 수 있는 자리가 아니다 — 성적표에 섞이면 고르는 쪽이 헷갈린다.
  const NOT_A_SEAT = /image|mesh|meshy|tts|whisper|embed/i;
  const lines = [...rows.values()].filter((r) => !NOT_A_SEAT.test(r.model)).sort((a, b) => b.n - a.n).map((r) =>
    `- ${r.model}: ${r.n}판 · 검사에 떨어진 판 ${r.bad} · **사장님이 되돌린 판 ${r.human}** · 판당 평균 $${(r.usd / Math.max(1, r.n)).toFixed(3)}`,
  );
  return lines.length ? lines.join("\n") : "- (아직 이 회사의 기록이 없다)";
}

/** **판단은 그대로 두고 깨질 것만 잡는다.** 문턱이 아니라 난간이다(149회차와 같은 규칙). */
export function safePlace(raw: { place?: string; why?: string; risk?: string } | null | undefined, opts: { needsEyes?: boolean } = {}): Placement {
  const want = (raw?.place ?? "").trim();
  const keyed = (p: Place) => (PLACES[p].vendor === "openai" ? !!process.env.OPENAI_API_KEY : !!process.env.DEEPSEEK_API_KEY);
  let place: Place = isPlace(want) ? want : DEFAULT_PLACE;
  let picked = isPlace(want);
  // 그림이 딸린 일을 눈 없는 자리에 앉히면 **조용히** 글만 읽고 답한다 — 가장 나쁜 고장이다.
  if (opts.needsEyes && !PLACES[place].sees) { place = "gpt-5"; picked = false; }
  // 열쇠가 없는 자리는 고를 수 없다. 이건 취향이 아니라 있고 없고다.
  if (!keyed(place)) { place = keyed(DEFAULT_PLACE) ? DEFAULT_PLACE : "gpt-5"; picked = false; }
  return { place, picked, why: raw?.why ?? "(고르지 못해 하던 자리로)", risk: raw?.risk ?? "" };
}

/** 사람이 읽는 한 줄 — 결과물·기록에 남겨서 "왜 이 모델이었나" 를 되물을 수 있게. */
export function placeLine(p: Placement): string {
  return `배치: ${p.place}${p.picked ? "" : " (판단 없이 기본값)"} · 왜: ${p.why}${p.risk ? ` · 틀린다면: ${p.risk}` : ""}`;
}

/**
 * 일 하나를 읽고 자리를 고른다. **싼 자리에서 한 번** 부른다(routine).
 * 고르기가 실패하면 던지지 않고 기본값으로 돌아간다 — 배치 때문에 일이 멈추면 안 된다.
 */
export async function placeWork(
  ai: AIProvider,
  input: { order: string; kind: string; facts: string; needsEyes?: boolean },
): Promise<Placement> {
  const table = Object.entries(PLACES)
    .map(([id, v]) => `- ${id} — 출력 100만 토큰 $${v.out}${v.sees ? " · 그림을 본다" : " · 그림을 못 본다"} · ${v.note}`)
    .join("\n");
  try {
    const { output } = await ai.generateStructuredOutput({
      systemInstructions: SYS,
      input: [
        "## 앉힐 수 있는 자리",
        table,
        "",
        "## 이 회사에서 실제로 있었던 일 (우리 장부에서 센 것)",
        input.facts,
        "",
        "## 이번 일",
        `종류: ${input.kind}`,
        input.needsEyes ? "그림을 봐야 하는 일이다." : "",
        `주문: ${input.order.slice(0, 1200)}`,
      ].filter(Boolean).join("\n"),
      schema: placeSchema,
      schemaName: "work_placement",
      maxTokens: 800,
      tier: "routine",
    });
    return safePlace(output, { needsEyes: input.needsEyes });
  } catch {
    return safePlace(null, { needsEyes: input.needsEyes });
  }
}
