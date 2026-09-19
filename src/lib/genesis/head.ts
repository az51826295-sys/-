import { z } from "zod";
import type { AIProvider } from "@/lib/providers/types";
import type { Supabase } from "@/lib/execution/shared";
import { PLACES, placeFacts, safePlace, type Placement } from "@/lib/providers/place";
import { loadSpecs, specLine } from "@/lib/hand/spec";

/**
 * **머리 — 판단자 AI 의 한 자리** (161회차 2026-09-17).
 *
 * 사장님: *"판단자 ai 만들자."*
 *
 * 어제까지 판단은 다섯 자리에 **따로** 있었다 — 배치(152)·연출(149)·심판자(150)·반응 읽기(156)·기계(159).
 * 일이 들어오면 각자 자기 것만 보고 자기 말만 했다. 사람이 "왜 이렇게 했나" 를 물을 한 자리가 없었고,
 * 사장님 판정은 여전히 0건이었다 — 판단이 **사람 눈앞에 나오기 전에** 일이 시작되기 때문이다.
 *
 * 머리는 일이 시작되기 **직전에 한 번** 돈다. 기계가 사실을 대고(장부·기계 사양·채택 규칙·지출), 머리가 한 번에 정한다:
 * 어느 모델에 앉힐지 · 어느 기계에서 돌지 · 얼마나 크게 만들지 · 진짜 재료가 필요한지 · **사람에게 한 줄로 뭐라 할지.**
 * 그 한 줄이 계획 카드 맨 위에 뜬다. 사장님이 거기 대고 한 말은 반응 읽기가 읽어 학습 재료가 된다 — 이게 판정이 0건에서
 * 벗어나는 길이다. 머리는 문이 아니다: 정하지 못하면 하던 대로 간다.
 */

export const decisionSchema = z.object({
  title: z.string().describe("이 일을 사람이 알아보게 부르는 짧은 이름. 12자 안팎."),
  kind: z.string().describe("무엇을 만드는 일인가 한 낱말(영상·조사·문서·게임·3D·앱…). 사람이 읽는 말이지 내부 이름이 아니다."),
  place: z.string().describe(`앉힐 모델 자리. ${Object.keys(PLACES).join(" / ")} 중 하나를 그대로.`),
  machine: z.string().describe("이 결과물이 돌아갈 기계. 잰 기계 목록의 호스트 이름 하나, 또는 '기계 무관'(문서·영상처럼 어디서나 열리는 것)."),
  setup: z.string().describe("그 기계에 먼저 차려야 할 것. 없으면 '없음'. 있으면 무엇을 왜 — 잰 사양을 근거로."),
  size: z.string().describe("얼마나 크게 만들 것인가 — 길이·장면 수·분량 같은 것을 자기 말로. 주문에 숫자가 있으면 그 숫자."),
  materials: z.string().describe("진짜 재료가 필요한가(영상 모델로 찍는 화면, 실제 화면 녹화, 자료 원문…). 글자만으로 되는 일이면 '글자면 된다'."),
  showToPerson: z.string().describe("**사장님이 일 시작 전에 보는 한 줄.** 무엇을 어떻게 만들지, 왜 그렇게 정했는지. **모델 이름(gpt·deepseek·sora 같은 것)과 내부 id 는 절대 쓰지 마라** — 사장님은 그걸 모른다. 틀렸으면 사장님이 여기 대고 말한다."),
  estimate: z.string().describe("값과 시간의 감. 예: '약 $1.5 · 6분'. 장부의 판당 값을 근거로. 모르면 '모르겠다'."),
  why: z.string().describe("이 결정의 근거 두어 줄 — 잰 값을 대라."),
  risk: z.string().describe("틀린다면 어디서. 모르면 '모르겠다'."),
});
export type Decision = z.infer<typeof decisionSchema> & { placement: Placement; decidedBy: string; at: string };

const SYS = [
  "너는 AI 사무실(로키)의 **머리**다. 일이 시작되기 직전에 한 번 돌아, 이 일을 어떻게 할지 **한 번에** 정한다.",
  "아래는 전부 기계가 장부에서 센 사실이다. 네 의견을 보태되 사실을 지어내지 마라.",
  "",
  "- 모델 자리는 값이 다르다. 비싼 자리는 그만한 이유가 있어야 한다. 판이 적은 자리의 성적은 믿을 게 못 된다.",
  "- 기계 사양이 있으면 그 기계에서 돌게 정한다. 사양이 빠듯하면 그 사실을 먼저 말한다. 관리자 권한을 요구하는 길은 고르지 않는다.",
  "- 광고·홍보처럼 보여 줘야 하는 일은 글자만으로 안 된다(어제 광고 세 판이 글자 카드라 쓰레기였다). 차분한 설명·자료 정리는 글자면 된다.",
  "- 주문에 숫자(초·장·개)가 있으면 그 숫자다. 네가 편한 값으로 옮기지 마라.",
  "- `showToPerson` 은 사장님이 읽는다. 짧고, 무엇을·어떻게·왜. 내부 이름(모델 id·직원 id)을 쓰지 마라.",
  "- 막는 자리가 아니다. 안 된다고 끝내지 말고 되게 하려면 뭐가 필요한지 말해라.",
].join("\n");

/** 머리가 보는 사실 — 의견 0. 못 읽은 것은 못 읽었다고 적는다. */
export async function headFacts(db: Supabase, companyId: string): Promise<string> {
  const parts: string[] = [];
  parts.push("### 모델 자리 (장부에서 센 것)");
  parts.push(await placeFacts(db, companyId));
  parts.push(Object.entries(PLACES).map(([id, v]) => `- ${id}: 출력 100만 토큰 $${v.out}${v.sees ? " · 그림을 본다" : " · 그림을 못 본다"} · ${v.note}`).join("\n"));
  // 184회차 09-19 (2단계 1번): 섞어 보내기 성적표 — 같은 심판이 같은 종류의 일(조각 고침)을 본 기록. 회사 전체, 최근 30일.
  try {
    const { seatRecords, fixCandidates, recordLine } = await import("@/lib/skills/appBuild/seats");
    const rec = await seatRecords(db, fixCandidates());
    parts.push("### 고치는 자리 성적표 (섞어 보내기 — 같은 심판이 본 것, 30일)");
    parts.push(rec.length ? rec.map((r) => `- ${recordLine(r)}`).join(String.fromCharCode(10)) : "- (아직 없다)");
  } catch { /* 성적표를 못 읽으면 없는 대로 */ }

  parts.push("### 일은 어디서 도나 (사실)");
  parts.push([
    "- 만드는 것은 **로키 서버**에서 한다 — ffmpeg·목소리(TTS)·영상 모델(sora-2)·그림 모델이 거기 있다. 아래 기계는 **결과물이 돌아갈 곳**이지 만드는 곳이 아니다.",
    "- 그래서 영상·문서·조사는 기계 사양과 무관하다. 게임·앱처럼 **그 기계에서 실행**되는 것만 기계를 본다(엔진 설치는 로키 손이 사용자 폴더에 한다).",
  ].join("\n"));
  parts.push("### 잰 기계 (로키 손이 보낸 것)");
  try {
    const specs = await loadSpecs(db, companyId);
    parts.push(specs.length ? specs.slice(0, 3).map(specLine).join("\n\n") : "- 잰 기계가 없다 — 기계 무관으로 가거나, 손이 먼저 재야 한다.");
  } catch (e) { parts.push(`- 기계 목록을 못 읽었다(${e instanceof Error ? e.message : e})`); }

  parts.push("### 이 회사가 배워서 지키는 규칙");
  const { data: rules } = await db.from("organization_knowledge").select("title").eq("company_id", companyId).eq("status", "active").not("learning_candidate_id", "is", null).limit(10);
  const rs = (rules ?? []) as { title: string }[];
  parts.push(rs.length ? rs.map((r) => `- ${r.title}`).join("\n") : "- (아직 없다)");

  parts.push("### 지갑");
  const { data: co } = await db.from("companies").select("spend_limit_usd, spend_window_days").eq("id", companyId).maybeSingle();
  const lim = (co as { spend_limit_usd: number | null; spend_window_days: number | null } | null);
  const days = lim?.spend_window_days ?? 30;
  const since = new Date(Date.now() - days * 86400e3).toISOString();
  const { data: usage } = await db.from("model_usage").select("cost_usd").eq("company_id", companyId).gte("created_at", since).limit(5000);
  const spent = ((usage ?? []) as { cost_usd: number | string }[]).reduce((s, u) => s + Number(u.cost_usd ?? 0), 0);
  parts.push(`- 최근 ${days}일 지출 $${spent.toFixed(2)} / 한도 $${lim?.spend_limit_usd ?? "?"} → 남은 $${lim?.spend_limit_usd ? Math.max(0, lim.spend_limit_usd - spent).toFixed(2) : "?"}`);

  parts.push("### 심판자와 사장님");
  const { data: judged } = await db.from("deliverables").select("id, content_json->judge->>wouldStop").eq("company_id", companyId).not("content_json->judge", "is", null).order("created_at", { ascending: false }).limit(5);
  const js = (judged ?? []) as { wouldStop: string | null }[];
  const { count: reviews } = await db.from("deliverable_reviews").select("id", { count: "exact", head: true }).eq("company_id", companyId);
  parts.push(`- 심판자가 말한 판 ${js.length}건(최근) · 사장님 판정 ${reviews ?? 0}건${js.length ? `\n- 최근 심판자 말: ${js.map((j) => (j.wouldStop ?? "").slice(0, 60)).filter(Boolean).join(" / ")}` : ""}`);
  return parts.join("\n");
}

/**
 * 한 번 정한다. 실패하면 던지지 않는다 — 배치는 기본값, 나머지는 빈 채로(문이 아니다).
 */
export async function decide(ai: AIProvider, input: { order: string; kind: string; facts: string; needsEyes?: boolean }): Promise<Decision> {
  const at = new Date().toISOString();
  try {
    const { output, model } = await ai.generateStructuredOutput({
      systemInstructions: SYS,
      input: ["## 사실", input.facts, "", "## 이 일", `종류(기계가 적은 것): ${input.kind}`, input.needsEyes ? "그림을 봐야 하는 일이다." : "", `주문: ${input.order.slice(0, 1500)}`].filter(Boolean).join("\n"),
      schema: decisionSchema, schemaName: "head_decision", maxTokens: 6000, tier: "judgment",
    });
    // 난간(사람에게 나가는 글): 모델 이름이 새면 걷는다. 첫 판(161회차)에 "gpt-5 선택했습니다" 가 사장님 줄에 그대로 나갔다.
    const ids = [...Object.keys(PLACES), "gpt-5-mini", "deepseek-chat", "deepseek-v4-flash", "sora-2", "sora-2-pro", "gpt-image-2"].sort((a, b) => b.length - a.length);
    // 모델 이름의 특수문자는 "." 과 "-" 뿐 — 글자 하나씩 문자 클래스로 감싸 정규식을 피한다(역슬래시 없이).
    const escapeRe = (x: string) => x.split("").map((ch) => (/[a-z0-9]/i.test(ch) ? ch : "[" + ch + "]")).join("");
    const scrub = (t: string) => t.replace(new RegExp(ids.map(escapeRe).join("|"), "gi"), "AI").replace(/AI( +AI)+/g, "AI");
    return { ...output, showToPerson: scrub(output.showToPerson), placement: safePlace({ place: output.place, why: output.why, risk: output.risk }, { needsEyes: input.needsEyes }), decidedBy: model, at };
  } catch (e) {
    const why = `머리가 정하지 못했다(${e instanceof Error ? e.message.slice(0, 80) : e}) — 하던 대로 간다`;
    return {
      title: "", kind: input.kind, place: "", machine: "기계 무관", setup: "없음", size: "", materials: "", showToPerson: "", estimate: "모르겠다", why, risk: "",
      placement: safePlace(null, { needsEyes: input.needsEyes }), decidedBy: "none", at,
    };
  }
}

/** 사람이 읽는 몇 줄 — 결과물·기록에 남긴다. */
export function decisionLines(d: Decision): string[] {
  if (!d.showToPerson) return [`머리: ${d.why}`];
  return [
    `**머리가 정한 것** — ${d.showToPerson}`,
    `  자리 ${d.placement.place}${d.placement.picked ? "" : "(기본값)"} · 기계 ${d.machine}${d.setup !== "없음" ? ` · 먼저 ${d.setup}` : ""} · 크기 ${d.size} · 재료 ${d.materials} · ${d.estimate}`,
    `  왜: ${d.why}`,
    ...(d.risk && d.risk !== "모르겠다" ? [`  틀린다면: ${d.risk}`] : []),
  ];
}
