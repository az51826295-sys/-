import { z } from "zod";
import type { AIProvider } from "@/lib/providers/types";

/**
 * **부탁 심판자 — 시킨 것을, 시킨 만큼 했는가** (166회차 2026-09-17).
 *
 * 사장님(09-17 23:3x): *"심판자 AI를 잘 만들면 돼."* — 그날 밤 로키가 부호 두 줄짜리 고장에 911줄짜리 새 게임을 낸 직후다.
 *
 * 그 판을 기존 심판자(`judge.ts`)는 볼 수 없었다. 그 심판자는 **화면 사진**을 본다 — 새 게임도 화면은 멀쩡했다.
 * 틀린 것은 그림이 아니라 **부탁과 한 일의 크기가 안 맞은 것**이다. 그건 글로 보인다: 사람이 한 말, 그리고 실제로 바뀐 것.
 * 화면 보는 눈은 40~45%만 잡았지만(09-16 실측), 이 자리는 글을 읽는 일이라 모델이 잘하는 쪽이다.
 *
 * 자리를 나누는 법은 같다: **기계가 사실을 세고**(새 파일·없어진 파일·바뀐 줄 수·바뀐 줄 발췌), **AI 가 판정한다.**
 * 블라인드도 같다: 합격 기준 개수·"통과" 딱지·직원의 자기 보고(coverage)를 **주지 않는다** — 그날 그 판의 자기 보고는 26/26 이었다.
 * 문턱(예: 5%)은 여기 없다. "큰 기능 추가"에 40%가 바뀌는 건 맞는 일이다 — 그 구별이 판정이다.
 */

export type JudgedFile = { path: string; contents: string };

export const askVerdictSchema = z.object({
  asked: z.string().describe("사람이 실제로 부탁한 것을 한 줄로. 사람 말에 없는 것을 보태지 마라."),
  askedSize: z.enum(["고장 하나", "작은 손질", "기능 추가", "새로 만들기"]).describe("부탁의 크기"),
  did: z.string().describe("바뀐 것을 보고, 실제로 한 일을 한두 줄로. 바뀐 줄 발췌에 없는 것을 근거로 쓰지 마라."),
  sizeMatch: z.enum(["맞다", "넘쳤다", "모자라다", "엉뚱하다"]).describe("한 일의 크기가 부탁의 크기와 맞는가. 부탁받지 않은 것을 만들었으면 '넘쳤다', 부탁한 자리를 안 고쳤으면 '모자라다' 또는 '엉뚱하다'."),
  fixedTheThing: z.enum(["고쳤다", "안 고쳤다", "모르겠다"]).describe("사람이 말한 바로 그것이, 사람이 쓰던 그 파일에서 고쳐졌는가. 발췌로 알 수 없으면 '모르겠다' — 찍지 마라."),
  uninvited: z.array(z.string()).describe("부탁받지 않았는데 생긴 것(새 파일·새 기능·이름 바꾸기·다시 쓴 부분). 없으면 빈 배열."),
  verdict: z.enum(["내보낸다", "되돌린다", "못 봤다"]).describe("이 판을 사람에게 그대로 내보낼 것인가. 사람이 받아 보고 '내가 시킨 건 이게 아닌데' 할 판이면 '되돌린다'."),
  toWorker: z.string().describe("'되돌린다' 면 직원에게 줄 한두 줄 — 무엇을 하지 말고 무엇만 하라. 아니면 빈 글."),
  toPerson: z.string().describe("사람에게 보일 한 줄(쉬운 말, 모델·도구 이름 없이). 무엇이 부탁과 달랐는지 또는 부탁대로라는 것."),
  confidence: z.number().min(0).max(1),
});
export type AskVerdict = z.infer<typeof askVerdictSchema>;

export type ChangeFacts = {
  newPaths: string[]; gonePaths: string[];
  files: { path: string; before: number; after: number; removed: number; added: number }[];
  removedSample: string[]; addedSample: string[];
};

/** 기계가 세는 사실. 줄 집합 비교(자리 이동은 안 센다). 발췌는 앞에서부터 — 고르지 않는다(고르면 그게 판정이다). */
export function changeFacts(prev: JudgedFile[], next: JudgedFile[], sample = 60): ChangeFacts {
  const lines = (s: string) => s.replace(/\r\n/g, "\n").split("\n");
  const newPaths = next.filter((n) => !prev.some((p) => p.path === n.path)).map((n) => n.path);
  const gonePaths = prev.filter((p) => !next.some((n) => n.path === p.path)).map((p) => p.path);
  const files: ChangeFacts["files"] = [];
  const removedSample: string[] = [], addedSample: string[] = [];
  for (const p of prev) {
    const n = next.find((x) => x.path === p.path);
    if (!n) continue;
    const a = lines(p.contents), b = lines(n.contents);
    const inB = new Map<string, number>(); for (const l of b) inB.set(l, (inB.get(l) ?? 0) + 1);
    const inA = new Map<string, number>(); for (const l of a) inA.set(l, (inA.get(l) ?? 0) + 1);
    let removed = 0, added = 0;
    for (const l of a) { const k = inB.get(l) ?? 0; if (k > 0) inB.set(l, k - 1); else { removed++; if (l.trim() && removedSample.length < sample) removedSample.push(`${p.path}: ${l.trim().slice(0, 160)}`); } }
    for (const l of b) { const k = inA.get(l) ?? 0; if (k > 0) inA.set(l, k - 1); else { added++; if (l.trim() && addedSample.length < sample) addedSample.push(`${p.path}: ${l.trim().slice(0, 160)}`); } }
    files.push({ path: p.path, before: a.length, after: b.length, removed, added });
  }
  for (const path of newPaths) {
    const n = next.find((x) => x.path === path)!;
    const b = lines(n.contents);
    files.push({ path, before: 0, after: b.length, removed: 0, added: b.length });
    for (const l of b) if (l.trim() && addedSample.length < sample) addedSample.push(`${path}: ${l.trim().slice(0, 160)}`);
  }
  return { newPaths, gonePaths, files, removedSample, addedSample };
}

const SYSTEM =
  "너는 이 회사의 심판자다. 직원이 낸 판을 사람에게 내보내기 전에 본다. 보는 것은 하나다: **사람이 시킨 것을, 시킨 만큼 했는가.**\n\n" +
  "- 너는 사람 편이다. 사람은 지난 판에서 마음에 든 것이 그대로이길 바란다. 고장 하나를 말했는데 게임이 통째로 바뀌어 오면 사람은 화가 난다 — 설령 새 판이 더 좋아도.\n" +
  "- 반대로 사람이 큰 것을 시켰으면 많이 바뀌는 것이 맞다. **바뀐 양 자체는 죄가 아니다. 부탁의 크기와 안 맞는 것이 죄다.**\n" +
  "- 아래 '기계가 센 사실' 은 사실이다(믿어라). 직원의 자기 보고나 통과 딱지는 일부러 안 준다.\n" +
  "- 발췌에 안 보이는 것을 지어내지 마라. 알 수 없으면 '모르겠다'·'못 봤다' 라고 한다.\n" +
  "- 사람이 쓰던 파일이 안 고쳐지고 새 파일이 생겼으면, 사람은 자기 파일을 열어 같은 고장을 다시 본다 — 그건 안 고친 것이다.";

export async function judgeAsk(ai: AIProvider, o: { said: string; previousTitle?: string; facts: ChangeFacts; howToRun?: string }): Promise<{ verdict: AskVerdict; model: string }> {
  const f = o.facts;
  const input =
    `## 사람이 한 말 (원문)\n${o.said}\n\n` +
    (o.previousTitle ? `## 지난 판\n${o.previousTitle}\n\n` : "") +
    "## 기계가 센 사실\n" +
    `- 새로 생긴 파일: ${f.newPaths.length ? f.newPaths.join(", ") : "없음"}\n` +
    `- 없어진 파일: ${f.gonePaths.length ? f.gonePaths.join(", ") : "없음"}\n` +
    f.files.map((x) => `- ${x.path}: ${x.before}줄 → ${x.after}줄 · 없어진 줄 ${x.removed} · 새로 생긴 줄 ${x.added}`).join("\n") + "\n\n" +
    `## 없어진 줄 (앞에서부터 ${f.removedSample.length}줄)\n${f.removedSample.join("\n") || "(없음)"}\n\n` +
    `## 새로 생긴 줄 (앞에서부터 ${f.addedSample.length}줄)\n${f.addedSample.join("\n") || "(없음)"}\n` +
    (o.howToRun ? `\n## 직원이 적은 실행 방법\n${o.howToRun.slice(0, 800)}\n` : "");
  const r = await ai.generateStructuredOutput({ systemInstructions: SYSTEM, input, schema: askVerdictSchema, schemaName: "ask_verdict", maxTokens: 6000, tier: "judgment" });
  return { verdict: r.output as AskVerdict, model: ai.model };
}
