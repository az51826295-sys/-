import { z } from "zod";
import type { AIProvider } from "@/lib/providers/types";

/**
 * 심판자 (132회차 09-16). 사장님 지시: **"재는 자는 의미없다. 재는자 대신 심판자 ai를 만들어라."**
 *
 * 왜 이걸 만드는가 — 우리 기록이 사장님 말을 증명한다:
 *   · 09-08 09:56 결과물 `5711714d` — 기계 검사 **14개 전부 통과(만점)**. 사장님은 같은 화면을 보고
 *     "투구 크기 개판인데" 를 **네 번** 쳤다.
 *   · 09-08 03:56 `7e962317` — **10개 전부 통과**. 사장님: "이번엔 투구가 점처럼 작아졌어."
 * 숫자 자는 "1.29배" 를 보고 통과를 줬다. 사람은 **그림**을 보고 퇴짜를 놨다. 자가 재는 것과
 * 사람이 보는 것이 애초에 다른 것이었다.
 *
 * ## 그런데 자를 없애지는 않는다
 * 127회차에 잰 것: 시험 없는 요구사항은 그냥 버려진다. 자를 지우면 그 항목은 죽는다.
 * 그래서 **기계 자는 사실을 대고, 심판자는 판정을 한다** 로 자리를 나눈다. 컴파일됐나·씬이 열리나
 * 같은 것은 심판자가 볼 필요가 없다(그건 사실이지 취향이 아니다). **얹은 것이 제대로 얹혔나** 처럼
 * 사람 눈이 결정하던 자리가 심판자 몫이다.
 *
 * ## 블라인드
 * 심판자에게 기계 검사 결과를 **주지 않는다.** 주면 "통과 14 실패 0" 을 읽고 거기 맞춘다 —
 * 그러면 어긋나는 곳이 영영 안 보인다. 규칙 고리의 블라인드 검증과 같은 이유다.
 *
 * ## 적재적소 (사장님 09-16 추가 지시)
 * > "최신기술 등을 심판자가 파악하여 넣어야 한다 적재적소"
 *
 * 그래서 심판자의 일은 둘이다:
 *   ① **본다** — 주문대로 됐나, 어디가 어떻게 잘못됐나(그림을 짚어서)
 *   ② **처방한다** — 이 자리에 지금 쓸 수 있는 방법이 무엇인가, 왜 그것인가
 * ②는 지어내면 독이라서 **찾아본 것만** 적게 하고 출처를 달게 한다. 못 찾으면 비운다.
 */

export const JUDGE_MAX_IMAGES = 5;

/** 얼마나 나쁜가. '치명' 만 되돌린다 — 전부 되돌리면 아무것도 안 나간다. */
export type Severity = "치명" | "거슬림" | "사소";

export const judgeSchema = z.object({
  verdict: z.enum(["통과", "고쳐야 한다", "못 봤다"]).describe("주문대로 됐는가. 그림이 안 보이거나 판단할 수 없으면 '못 봤다' — 찍지 마라."),
  seen: z.string().describe("그림에서 실제로 보이는 것을 먼저 적는다(한두 줄). 여기 없는 것을 아래에서 근거로 쓰지 마라."),
  faults: z.array(z.object({
    what: z.string().describe("무엇이 잘못됐나. '어색하다' 말고 '투구가 머리를 덮지 않고 어깨 높이에 떠 있다' 처럼."),
    where: z.string().describe("어느 그림의 어디인가(예: '얼굴 사진, 머리 위')"),
    severity: z.enum(["치명", "거슬림", "사소"]),
  })).describe("잘못된 곳. 없으면 빈 배열."),
  // 133회차: 기준점 없는 눈금은 뜻이 없다. 첫 판에 **통과를 주면서 1점**을 매겼다(멀쩡한 프레임에).
  // 그래서 칸마다 1·5·10 이 무엇인지 못 박는다. 점수와 판정이 어긋나면 둘 중 하나가 틀린 것이다.
  scores: z.object({
    fidelity: z.number().min(1).max(10).describe("주문 지킴. 10=시킨 것이 다 화면에 있다 / 5=절반쯤 · 빠진 게 있다 / 1=엉뚱한 것이 나왔다"),
    legibility: z.number().min(1).max(10).describe("읽힘. 10=또렷하고 안 잘린다(명암비 7:1 이상·여백 안) / 5=읽히지만 아슬아슬 / 1=안 보이거나 잘려 못 읽는다. **잰 값이 있으면 그 값에 맞춰라**"),
    composition: z.number().min(1).max(10).describe("짜임. 10=자리가 잡혔다 / 5=한쪽으로 쏠렸지만 볼 만하다 / 1=엉망이다"),
  }).describe("갈래별 점수. 판정을 대신하지 않는다 — 어디가 약한지 보려고 따로 매긴다. **판정이 '통과' 면 어느 칸도 4 아래일 수 없다**(그럴 만하면 판정을 바꿔라)."),
  prescriptions: z.array(z.object({
    spot: z.string().describe("어느 자리에 넣는가"),
    use: z.string().describe("무엇을 쓰는가 — 방법·기능·도구 이름"),
    why: z.string().describe("왜 그것이 이 자리에 맞는가"),
    source: z.string().nullable().describe("찾아본 출처. 못 찾았으면 null — 지어내지 마라."),
  })).describe("적재적소. 모르면 빈 배열. 지어낸 것은 없느니만 못하다."),
  confidence: z.number().min(0).max(1).describe("이 판정을 얼마나 믿는가"),
});

export type JudgeVerdict = z.infer<typeof judgeSchema>;

const SYSTEM = [
  "너는 심판자다. 만든 사람이 아니라 **받는 사람** 편에 선다.",
  "",
  "주문과 결과 사진을 받는다. **검사 점수는 못 받는다** — 일부러 안 준다. 숫자에 끌려가면 네가 필요 없다.",
  "이 회사는 검사 14개를 전부 통과한 판을 사장님이 '개판' 이라며 네 번 되돌려 보낸 적이 있다. 네가 있는 이유가 그것이다.",
  "",
  "**순서를 지켜라.**",
  "1. `seen` 에 사진에서 **실제로 보이는 것**만 적는다. 안 보이면 안 보인다고 적는다.",
  "2. 그 다음에 주문과 맞춰 본다. `seen` 에 없는 것을 근거로 삼지 마라.",
  "3. 사진이 흐리거나 없거나 각도가 안 나와서 판단할 수 없으면 **`못 봤다`**. 찍는 것보다 낫다.",
  "",
  "**무엇을 보나.** 얹은 것이 제자리에 제 크기로 얹혔나 · 주문한 것이 화면에 있나 · 사람이 보면 바로 이상한 곳이 있나.",
  "컴파일·씬 열림 같은 사실은 다른 자가 잰다. 너는 **눈으로 판단하는 자리**만 맡는다.",
  "",
  "**엄하게.** '대체로 괜찮다' 는 판정이 아니다. 사장님이 이걸 보고 다시 시키겠는가로 판단해라.",
  "다만 **주문에 없는 것으로 떨어뜨리지 마라** — 프로토타입에 회색 마네킹이 서 있는 것은 잘못이 아니다.",
  "",
  "**등급을 부풀리지 마라.** 이것이 네가 제일 틀리기 쉬운 곳이다(09-16 첫 판에 실제로 틀렸다 —",
  "짙은 회색을 '검정이 아니다' 며 치명으로 매겼다). 기준은 하나다: **받는 사람이 이걸 보고 다시 시키겠는가.**",
  "  · `치명` — 시킨 것이 안 됐다. 글자가 안 보인다 · **글자가 화면 밖으로 잘려 못 읽는다** · 물건이 엉뚱한 데 붙었다 · 주문한 것이 화면에 없다.",
  "    (잘림은 '보기 나쁨' 이 아니다 — 읽을 수 없는 글자는 **없는 글자**다. 133회차에 이걸 '거슬림' 으로 매겨 그냥 내보낼 뻔했다.)",
  "  · `거슬림` — 됐는데 보기 나쁘다. 여백이 한쪽으로 쏠렸다 · 줄이 안 맞는다.",
  "  · `사소` — 말해 두면 좋은 정도. 색조가 살짝 다르다 · 글자가 조금 작다.",
  "치명이 하나라도 있으면 일이 되돌아간다. **되돌릴 만한 것만 치명이다.**",
  "흠이 전부 거슬림·사소면 판정은 `통과` 이고, 흠은 적어만 둔다.",
  "",
  "**잰 값이 있으면 그것을 써라.** 명암비·여백·쏠림은 눈대중하면 틀린다 — 09-16 첫 판에 네가 '대비가 약하다' 고 했는데",
  "실제로 재니 19:1 이었다. 아래에 숫자가 있으면 그 숫자로 말하고, 없는 것만 눈으로 판단해라.",
  "",
  "**적재적소.** 잘못을 찾았으면, 그 자리에 지금 쓸 수 있는 방법을 적는다.",
  "처방은 **이 회사가 실제로 쓰는 연장**에 맞춰라. 사람이 프리미어를 켜는 회사가 아니다 — 코드가 만든다.",
  "어떤 연장을 쓰는지는 아래 '낸 것' 과 '찾아본 자료' 에 적혀 있다. 거기 없는 연장을 처방하면 아무도 못 쓴다.",
  "찾아본 것만 적고 출처를 단다. **모르면 빈 배열로 둬라** — 지어낸 처방은 없느니만 못하다.",
].join("\n");

export type JudgeInput = {
  /** 사장님이 시킨 말 그대로. */
  order: string;
  /** 무엇을 낸 판인가(유니티 씬·영상·분석). */
  kind: string;
  /** base64 PNG/JPEG, 데이터 URL 접두사 없이. 무엇을 찍은 사진인지 이름을 붙여 준다. */
  images: { label: string; b64: string }[];
  /** 찾아본 최신 자료(있으면). 심판자가 처방을 지어내지 않게 하는 재료다. */
  notes?: string[];
  /**
   * 기계가 **잰 값**(133회차). 명암비·여백·쏠림처럼 눈대중하면 틀리는 것들.
   * 첫 판에 심판자가 "대비가 약하다" 고 했는데 실제로 재 보니 **19:1** 이었다 — 눈대중이 틀렸다.
   * 여기엔 문턱도 통과/실패도 없다. 사실만 대고 **판정은 심판자가** 한다.
   */
  facts?: string[];
};

/**
 * 한 판을 심판한다. 기계 검사 결과는 **받지 않는다**(블라인드 — 인자에 자리조차 없다).
 * 그림이 없으면 부르지 않는다: 글만 보고 하는 판정은 이 자리의 일이 아니다.
 */
export async function judgeWork(ai: AIProvider, input: JudgeInput): Promise<{ verdict: JudgeVerdict; inputTokens: number; outputTokens: number; model: string }> {
  const imgs = input.images.slice(0, JUDGE_MAX_IMAGES);
  if (!imgs.length) throw new Error("심판자는 그림 없이 판정하지 않는다");
  const lines = [
    `## 주문 (사장님이 시킨 말)`,
    input.order.trim() || "(없음)",
    "",
    `## 낸 것`,
    `${input.kind} — 사진 ${imgs.length}장: ${imgs.map((i) => i.label).join(", ")} (붙은 순서대로다)`,
  ];
  if (input.notes?.length) {
    lines.push("", "## 찾아본 자료 (처방에 쓸 것. 여기 없는 것은 출처 null 로)", ...input.notes.map((n) => `- ${n}`));
  }
  if (input.facts?.length) {
    lines.push("", "## 기계가 잰 값 (눈대중하지 말고 이 숫자를 써라. 문턱은 없다 — 흠인지 아닌지는 네가 정한다)", ...input.facts.map((f) => `- ${f}`));
  }
  const r = await ai.generateStructuredOutput({
    systemInstructions: SYSTEM,
    input: lines.join("\n"),
    images: imgs.map((i) => i.b64),
    schema: judgeSchema,
    schemaName: "judge_verdict",
    // 추론하는 모델(gpt-5)은 답 앞에 생각을 먼저 쓴다 — 3000 으로는 생각만 하다 잘렸다(09-16 첫 판).
    // 판정 글 자체는 1000자면 되지만 생각 몫을 넉넉히 둔다.
    maxTokens: 8000,
    tier: "judgment",
  });
  return { verdict: r.output, inputTokens: r.inputTokens, outputTokens: r.outputTokens, model: r.model ?? ai.model };
}

/** 되돌릴 만한가. '치명' 이 하나라도 있으면 되돌린다 — 거슬림·사소는 적어만 둔다. */
export function shouldRedo(v: JudgeVerdict): boolean {
  return v.verdict === "고쳐야 한다" && v.faults.some((f) => f.severity === "치명");
}

/** 사람이 읽는 한 줄. */
export function judgeLine(v: JudgeVerdict): string {
  const worst = v.faults.find((f) => f.severity === "치명") ?? v.faults[0];
  if (v.verdict === "못 봤다") return "심판자: 못 봤다 — " + (v.seen || "사진으로 판단할 수 없다");
  if (v.verdict === "통과") return "심판자: 통과";
  return `심판자: 고쳐야 한다 — ${worst ? `${worst.what} (${worst.where})` : "이유 없음"}`;
}


/**
 * **끌리는가** (148회차 09-16). 사장님: *"기계가 아니라 인공지능으로 가야 한다. 재는 게 아니라 판단이다."*
 *
 * 위의 `judgeWork` 는 AI 를 부르지만 **기계처럼 쓴다** — 판정은 셋 중 하나, 등급도 셋 중 하나,
 * 되돌릴지는 한 줄짜리 함수, 게다가 잰 값을 먼저 물려준다. 답이 나오자마자 칸으로 뭉개진다.
 * 그건 자다. 중간에 모델이 끼었을 뿐이다.
 *
 * **그런데 "어색하다" 는 칸에 안 들어간다.** 광고가 눈길을 끄는지는 명암비로 정해지지 않는다.
 * 09-16 조사가 그 이유를 줬다: 사람들이 AI 광고에 "영혼 없다·싸구려·게으르다" 라고 하는 것은
 * **기술을 알아봐서가 아니다**(AI 광고를 AI라고 맞힌 사람은 13%뿐이었다). **아무도 아무것도 고르지 않은 것처럼 보여서**다.
 * 한국 연구의 결론이 그것이다 — 보는 사람은 기술이 아니라 **의도**를 본다.
 *
 * 그래서 여기는 칸이 없다. **자기 말로 답한다.**
 *   · 등급도 점수도 안 매긴다(점수는 판정보다 더 흔들린다 — 134회차에 쟀다).
 *   · **잰 값을 주지 않는다.** 숫자를 먼저 주면 거기 묶인다.
 *   · 판정을 강요하지 않는다 — "모르겠다" 도 답이다.
 * 이건 문이 아니다. 아무것도 막지 않는다. 사람이 읽고 정하라고 내놓는 말이다.
 */
export const appealSchema = z.object({
  firstGlance: z.string().describe("3초만 봤다고 치고, **맨 처음 든 생각 한 줄.** 다듬지 마라."),
  wouldStop: z.string().describe("피드에서 이게 지나간다면 멈출 것 같은가, 그냥 넘길 것 같은가. 왜 그런지 같이."),
  awkward: z.string().describe("어색한 곳이 있으면 **어디가 왜** 어색한지 네 말로. 없으면 없다고 해라. 등급 매기지 마라."),
  soulless: z.string().describe("**누군가 이걸 만들면서 무언가를 골랐다는 느낌이 드는가, 아니면 그냥 찍어낸 것 같은가.** 사람들이 AI 광고를 싫어하는 지점이 여기다."),
  oneChange: z.string().describe("딱 하나만 바꿀 수 있다면 무엇을 바꾸겠는가. 왜."),
});
export type Appeal = z.infer<typeof appealSchema>;

const APPEAL_SYSTEM = [
  "너는 이 광고를 **처음 보는 사람**이다. 만든 쪽이 아니다.",
  "",
  "점수를 매기지 마라. 등급도 매기지 마라. 통과·실패를 말하지 마라. **그런 걸 물은 게 아니다.**",
  "네 말로 답해라. 짧게. 꾸미지 마라.",
  "",
  "알아 둘 것 하나: 사람들이 AI 로 만든 광고를 싫어하는 이유는 **AI인 걸 알아봐서가 아니다.**",
  "실제로 알아보는 사람은 열에 하나뿐이다. 싫어하는 이유는 **아무도 아무것도 고르지 않은 것처럼 보여서**다.",
  "그래서 네가 볼 것은 화질이 아니라 **고른 흔적**이다 — 왜 이 장면인가, 왜 이 말인가, 왜 여기서 끊었는가.",
  "",
  "좋게 말해 주지 마라. 만든 사람에게 가장 쓸모없는 답이 '괜찮네요' 다.",
].join("\n");

/**
 * 광고·영상이 **끌리는지** 묻는다. 칸도 점수도 없고, 잰 값도 주지 않는다.
 * 프레임은 **이야기 순서대로** 넣는다 — 광고는 순서가 내용이다.
 */
export async function judgeAppeal(
  ai: AIProvider,
  input: { what: string; frames: { label: string; b64: string }[]; seconds?: number },
): Promise<{ appeal: Appeal; inputTokens: number; outputTokens: number; model: string }> {
  const imgs = input.frames.slice(0, JUDGE_MAX_IMAGES);
  if (!imgs.length) throw new Error("볼 것 없이 판단하지 않는다");
  const r = await ai.generateStructuredOutput({
    systemInstructions: APPEAL_SYSTEM,
    input: [
      `## 무엇인가`,
      input.what,
      input.seconds ? `전체 ${input.seconds.toFixed(1)}초.` : "",
      "",
      `## 붙은 화면 (이야기 순서대로 ${imgs.length}장: ${imgs.map((i) => i.label).join(" → ")})`,
    ].filter(Boolean).join("\n"),
    images: imgs.map((i) => i.b64),
    schema: appealSchema,
    schemaName: "appeal",
    maxTokens: 8000,
    tier: "judgment",
  });
  return { appeal: r.output, inputTokens: r.inputTokens, outputTokens: r.outputTokens, model: r.model ?? ai.model };
}
