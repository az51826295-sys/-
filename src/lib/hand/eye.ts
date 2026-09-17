import { z } from "zod";
import type { AIProvider } from "@/lib/providers/types";

/**
 * **눈 — 화면을 보고 다음 한 걸음을 정한다** (162회차 2026-09-17, 손 v2).
 *
 * 사장님: *"실시간으로 화면 봐 가지고 대신해 주는 기능"* → *"시작해"*.
 *
 * 손(v2)이 노트북 화면을 한 장 찍어 보내면, 여기서 모델이 **보고** 다음 한 걸음을 정한다 — 어디를 누를지, 뭘 칠지, 끝났는지.
 * 걸음마다 한 번 부른다. 한 걸음 ≈ $0.01(gpt-5, 그림 자리라 딥시크는 못 쓴다).
 *
 * 원칙은 심판자·머리와 같다: 칸을 주지 않는다(`say` 는 자기 말), 행동만 **주소**다(손이 할 줄 아는 다섯 가지).
 * 그리고 **화면 보는 AI 는 틀린다**(09-16 조사: 미세한 차이 40~45%, 애매하면 '됐다' 쪽으로) — 그래서 난간이 셋이다:
 *   ① 좌표는 화면 안으로만 ② 비밀번호·카드번호 칸이 보이면 멈추고 사람에게 ③ 걸음 상한과 사람의 마우스(손 쪽).
 */

export const stepSchema = z.object({
  see: z.string().describe("지금 화면에 뭐가 보이나 한 줄 — 어떤 창, 어떤 상태. 사람이 읽고 '그거 아닌데' 할 수 있어야 한다."),
  say: z.string().describe("그래서 다음에 뭘 할지 한 줄 — 왜 그걸 누르는지."),
  done: z.boolean().describe("목표가 화면에서 **이미** 이뤄졌으면 true. 이뤄질 것 같아서가 아니라 보여서."),
  needsHuman: z.boolean().describe("비밀번호·카드·계정 로그인·관리자 승인 창처럼 사람만 할 수 있는 것이 앞을 막으면 true. 그러면 손은 멈춘다."),
  action: z.object({
    kind: z.enum(["click", "double", "type", "key", "wait"]).describe("손이 할 줄 아는 것. click/double 은 x,y · type 은 text · key 는 text 에 키 이름(enter, esc, ctrl+s, win) · wait 는 1.5초 기다림(화면이 아직 바뀌는 중일 때)."),
    x: z.number().describe("누를 곳 x — **네가 받은 그림의 픽셀 좌표**(왼쪽 위가 0,0). click/double 에만."),
    y: z.number().describe("누를 곳 y. click/double 에만."),
    text: z.string().describe("type 이면 칠 글, key 면 키 이름. 아니면 빈 문자열."),
  }),
});
export type Step = z.infer<typeof stepSchema>;

const SYS = [
  "너는 사람의 노트북을 **대신 조작하는 손의 눈**이다. 화면 한 장과 목표를 받고, **다음 한 걸음만** 정한다.",
  "",
  "- 그림에서 실제로 보이는 것만 근거로 해라. 안 보이는 단추를 누르라고 하지 마라.",
  "- 한 걸음에 하나만. 누르고 나면 화면이 바뀌고, 그 다음 그림이 또 온다.",
  "- 목표가 **이미 화면에 이뤄져 있으면** done=true 로 끝내라. 될 것 같다고 끝내지 마라 — 보여야 한다.",
  "- 비밀번호·카드번호·계정 로그인·관리자 승인(UAC) 창이 앞을 막으면 needsHuman=true. 절대 거기에 뭘 치지 마라.",
  "- 화면이 아직 바뀌는 중(로딩·창 열리는 중)이면 wait.",
  "- 좌표는 네가 받은 그림의 픽셀이다(왼쪽 위 0,0). 단추의 **가운데**를 골라라.",
  "- 같은 자리를 세 번 눌렀는데 안 바뀌면 다른 길을 찾아라(키보드·메뉴).",
].join("\n");

/** 화면 한 장 + 목표 + 지난 걸음들 → 다음 한 걸음. 실패하면 던진다(손이 멈추고 사람에게 말한다). */
export async function nextStep(ai: AIProvider, input: { goal: string; png: string; width: number; height: number; history: string[] }): Promise<{ step: Step; model: string }> {
  const { output, model } = await ai.generateStructuredOutput({
    systemInstructions: SYS,
    input: [
      `## 목표`, input.goal,
      ``, `## 그림`, `${input.width}×${input.height} 픽셀. 좌표는 이 크기 기준.`,
      ``, `## 지금까지 한 걸음 (${input.history.length}개)`,
      input.history.length ? input.history.slice(-8).map((h, i) => `${i + 1}. ${h}`).join("\n") : "(아직 없음 — 첫 걸음)",
    ].join("\n"),
    images: [input.png],
    schema: stepSchema, schemaName: "hand_step", maxTokens: 4000, tier: "judgment",
  });
  // 난간 ①: 좌표는 화면 안으로만. 밖이면 wait 로 바꾼다 — 엉뚱한 데를 누르는 것보다 한 박자 쉬는 게 낫다.
  const a = { ...output.action };
  if ((a.kind === "click" || a.kind === "double") && !(a.x >= 0 && a.x < input.width && a.y >= 0 && a.y < input.height)) {
    return { step: { ...output, say: `${output.say} — 좌표(${a.x},${a.y})가 화면 밖이라 한 박자 쉰다`, action: { kind: "wait", x: 0, y: 0, text: "" } }, model };
  }
  // 난간 ②: 칠 글이 너무 길면 자른다(한 걸음에 한 줄).
  if (a.kind === "type" && a.text.length > 200) a.text = a.text.slice(0, 200);
  return { step: { ...output, action: a }, model };
}

export function stepLine(s: Step): string {
  const act = s.action.kind === "click" || s.action.kind === "double" ? `${s.action.kind} (${s.action.x},${s.action.y})` : s.action.kind === "wait" ? "wait" : `${s.action.kind} "${s.action.text}"`;
  return `${s.done ? "✔ 끝 · " : s.needsHuman ? "✋ 사람 · " : ""}${s.see} → ${s.say} [${act}]`;
}
