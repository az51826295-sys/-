/**
 * **비서 말투를 재는 자** (10-26). 모델 0 · 값 0.
 *   npx tsx engine/work/probe/voice-ruler.mts [--sabotage]
 *
 * 사장님: "비서같이 말투 만들어."
 *
 * 둘을 본다:
 *   ① **내가 쓴 예시가 내가 쓴 규칙을 통과하나.** 안 통과하면 규칙이 틀린 것이다
 *      (실제로 둘 틀렸다 — 매 줄 "사장님" 요구, 잡담에 되받는 물음 금지).
 *   ② **나쁜 답을 넣으면 잡나.** 통과만 보고 적으면 이빨 없는 자를 만든다(09-14).
 *
 * `--sabotage` 는 멀쩡한 예시를 일부러 망가뜨려 자가 잡는지 본다.
 */
import { checkVoice, voiceScore, SECRETARY_EXAMPLES, type VoiceOptions } from "../../../src/lib/chat/voice";

const 심기 = process.argv.includes("--sabotage");
let 나쁨 = 0;
const 재기 = (n: string, ok: boolean, 본?: unknown) => {
  if (!ok) 나쁨++;
  console.log((ok ? "통과" : "실패") + " " + n + (본 === undefined ? "" : "  " + JSON.stringify(본)));
};

/** 어느 예시가 잡담인지 — 자에 알려 줘야 잡담 규칙이 적용된다. */
const 잡담 = new Set(["그 우성이라고 사문 4따리 있거든?"]);

/* ── ① 예시가 제 규칙을 통과하나 ── */
console.log("= 예시가 제 규칙을 통과하나 =");
for (const e of SECRETARY_EXAMPLES) {
  const opts: VoiceOptions = { owner: true, smalltalk: 잡담.has(e.물음) };
  /* 심은 판: 답 뒤에 아부와 머리말과 긴 꼬리를 붙인다 — 자가 멀쩡하면 떨어져야 한다 */
  const 답 = 심기
    ? "확인해 보니 좋은 생각이십니다.\n" + e.답 + "\n한 줄\n두 줄\n세 줄\n네 줄\n다섯 줄\n정말 그렇습니까?"
    : e.답;
  const vs = checkVoice(답, opts);
  const s = voiceScore(vs);
  재기(`"${e.물음.slice(0, 18)}"`, s.fail === 0, { 맞음: s.pass, 어긋남: s.fail, 못잼: s.unknown, 어긴것: s.failed });
}

/* ── ② 나쁜 답을 잡나 — 심기와 별개로 늘 돈다 ── */
console.log("\n= 나쁜 답을 잡나 (각각 어긋남이 1개 이상이어야 한다) =");
const 나쁜것: { 이름: string; 답: string; opts?: VoiceOptions }[] = [
  { 이름: "머리말로 시작", 답: "확인해 보니 끝났습니다." },
  { 이름: "아부", 답: "끝났습니다. 좋은 생각이셨습니다." },
  { 이름: "얼버무림", 답: "아마도 끝난 것 같습니다." },
  { 이름: "되묻기로 끝", 답: "둘 중에 어느 쪽으로 할까요?" },
  { 이름: "너무 김", 답: "끝.\n둘\n셋\n넷\n다섯\n여섯\n일곱" },
  { 이름: "안쪽 낱말", 답: "심판자가 통과시켰습니다." },
  { 이름: "아는것/모르는것 목록", 답: "아는 것: 셋.\n모르는 것: 둘." },
  { 이름: "어긋난 호칭", 답: "당신이 요청한 작업이 끝났습니다." },
  { 이름: "첫 문장이 너무 김", 답: "지금까지 확인한 결과를 말씀드리면 열여섯 가지 검사를 모두 통과했고 한 장을 재는 데 걸린 시간은 339밀리초였습니다." },
  { 이름: "빈 답", 답: "   " },
];
for (const b of 나쁜것) {
  const s = voiceScore(checkVoice(b.답, { owner: true, ...(b.opts ?? {}) }));
  재기(`${b.이름} 을 잡는다`, s.fail >= 1, { 어긴것: s.failed });
}

/* ── ③ 반대편 — 멀쩡한 답을 떨어뜨리지 않나. 없으면 "짧게만 답하는 자" 가 된다 ── */
console.log("\n= 멀쩡한 답을 떨어뜨리지 않나 =");
const 멀쩡한것: { 이름: string; 답: string; opts?: VoiceOptions }[] = [
  { 이름: "한 줄 보고", 답: "끝났습니다. 339ms 입니다." },
  { 이름: "부탁 둘을 뒤에", 답: "코드는 다 됐습니다.\n\n`railway up` 돌려 주세요.\nSQL 한 장 붙이세요." },
  { 이름: "모른다고 말함", 답: "모르겠습니다. 장부를 못 읽었습니다." },
  { 이름: "진짜 막혀서 하나 물음", 답: "둘 중 하나를 정해 주셔야 합니다.\n월 4,900원으로 갈까요?", opts: { blocked: true } },
];
for (const g of 멀쩡한것) {
  const s = voiceScore(checkVoice(g.답, { owner: true, ...(g.opts ?? {}) }));
  재기(`${g.이름} 은 통과시킨다`, s.fail === 0, { 어긴것: s.failed });
}

if (심기) {
  console.log(나쁨 ? `\n심은 판에서 ${나쁨}개 잡았다 — 자가 산다` : "\n**심었는데 다 통과했다 — 자가 눈멀었다**");
  process.exit(나쁨 ? 0 : 1);
}
console.log(나쁨 ? `\n**${나쁨}개 실패**` : "\n전부 통과");
process.exit(나쁨 ? 1 : 0);
