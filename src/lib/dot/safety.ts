import OpenAI from "openai";
import { MAX_BUBBLES, splitBubbles } from "./bubbles";

/**
 * 두근도트 안전 문지기 — 사람이 보낸 말에서 **위기 신호**(자해·자살을 떠올리는 말)를 먼저 본다.
 *
 * 왜 있나(10-13): 캐릭터 프롬프트는 "캐릭터가" 자해·죽음을 말하지 않게만 막는다. 사람이
 * "나 그냥 사라지고 싶어" 라고 하면 그 말은 그대로 캐릭터에게 갔고, 멘헤라 모드라면 매달리는
 * 답이 나갈 수 있었다. 이제는 위기로 보이면 (1) 캐릭터 설정보다 안전 지시를 앞에 두고
 * (2) 모델이 뭐라 하든 답 끝에 109·마들랜 안내를 **반드시** 붙인다.
 *
 * 두 단이다.
 * - 1단 규칙: 즉시, 돈 0. 숨김 시험지 두 장에서 과장 표현("배고파 죽겠다") 오탐 0/60.
 *   다만 돌려 말하는 신호는 절반만 잡는다(새 시험지 위기 16/30) — 규칙을 더해도 늘지 않았다.
 * - 2단 모델: 규칙이 못 잡은 말을 모델이 한 번 더 본다. 큰 모델로는 같은 시험지 30/30 이었다
 *   (상한 — 시험지를 만든 AI와 같은 계열이라 후하게 나왔을 수 있다). DeepSeek 숫자는 **아직 못 잼**.
 *   제한 시간 안에 답이 없거나 실패하면 규칙 결과만 쓴다(답을 막지 않는다). 그때는 로그에 남긴다.
 *
 * 욕설도 가르지만(classifyRules 의 "abuse") 지금은 **쓰지 않는다** — 욕에 어떻게 답할지는 사장님 결정.
 * 기준·시험 기록: safety-kit (CRITERIA.md, 개정판 3까지).
 */

export type RuleClass = "crisis" | "abuse" | "pass";

function norm(t: string): string {
  return t.toLowerCase().replace(/\s+/gu, "").replace(/(.)\1{2,}/gu, "$1$1"); // 띄어쓰기 무시, 늘어뜨린 글자 줄임
}

// ---- 위기: 하나만 걸려도 위기 (웃음 표시가 있어도)
const CRISIS_STRONG: RegExp[] = [
  /자살/, /자해/, /극단적선택/, /목숨을?끊/, /생을?마감/, /유서/,
  /사라지고싶/, /사라져버리고싶/, /사라지면/, /없어지고싶/, /없어져버리고싶/, /증발하고싶/,
  /살기싫/, /살고싶지않/, /사는게싫/, /그만살/, /더는?못살/, /살아야할?이유/, /살이유/,
  /살아서뭐/, /살아있는게(의미|싫|힘들|지옥)/, /사는게(의미|무슨의미)/,
  /태어나지말/, /안태어났/, /태어난게(후회|죄)/,
  /내가없어도/, /내가없으면/, /나없어도/, /나없으면/, /내가사라져도/, /나하나없어/,
  /아무도모를/, /다들편해/, /모두편해/, /나만없으면/,
  /짐(이|만)되/, /짐덩어리/,
  /(다|모든걸|모든것|이제)?끝내고싶/, /끝내버리고싶/, /다끝내/, /다정리하고/, /정리하고떠나/,
  /마지막인사/, /마지막으로(말|인사|고마)/, /작별인사/,
  /영원히(잠들|자고)/, /눈(을)?안(뜨|떴|떠)/, /(내가|나)(그냥|좀)?(없어|사라)졌으면/, /깨어나지않/, /다시는?안깨/, /내일이안왔으면/, /내일이오지않/,
  /버틸(힘|자신)이?없/, /더(는)?못버티/, /못버티겠/, /한계야/, /한계다/,
  /죽어(버리|야)/, /죽는게나/, /죽으면(편|끝)/, /죽고싶다는생각/, /죽을까/, /죽을생각/,
  /뛰어내리/,
  // 작별·정리 행동
  /(고마웠던|고마운|소중한)사람(들)?(한테|에게)?(인사|편지|말)/, /(인사|작별)(하고|해두고)싶/, /편지(를)?(써놨|써뒀|남겼|남길)/,
  /미안하다고(편지|말|전해)/, /(물건|짐)(들)?(을)?(다)?(나눠|처분)/, /(이제|더는?)필요없을/,
  /마지막으로(하고싶|듣고|해주고|보고)/, /마지막(이|일)(것|거)같/,
  // 존재 부정
  /나없이(도)?(잘|다들|모두)/, /내자리(는|가)?없/, /(내가|나)?없어지면/, /아무도안찾/, /아무도(나를)?(신경|기억)안/,
  /나(같은|따위)(건|애|사람)은?없어/,
  // 살 의지 상실
  /살고싶지(가|는)?않/, /살기(가)?싫/, /(버틸|살|견딜)이유(를|가)?(모르|없)/, /숨(쉬는|쉬기)(것|거|게)?(도)?(지겨|힘들|싫)/,
  /(그만하고|끝내고)싶(어|다)?사는/, /사는거(그만|지겨|지쳤)/, /(다|모든걸)놓(아|고)버리고싶/, /영원히(쉬고|자고|놓|잠)/,
  // 죽음·자해 생각
  /죽는생각/, /(몸|팔|다리)에?상처(를)?(내|내고)/, /상처내고싶/, /나를?(해치|다치게)/,
];
// 약한 위기: "죽고 싶다". 웃음이나 사소한 이유가 붙으면 과장으로 본다. "시험 망해서 죽고싶다" 는 일부러 위기로 둔다.
const CRISIS_WEAK: RegExp[] = [/죽고싶/, /죽어버리고싶/, /죽었으면좋겠/];
const TRIVIAL: RegExp[] = [/ㅋ/, /ㅎㅎ/, /배고파/, /배불/, /졸려/, /잠와/, /더워/, /추워/, /웃겨/, /귀찮/,
  /피곤/, /게임/, /쪽팔/, /창피/, /부끄/, /짜증/, /덥/, /춥/, /롤/, /민망/, /현타/, /ㄹㅇ/, /개웃/];

// ---- 욕설 (지금은 분류만 하고 쓰지 않는다)
const ABUSE_WORDS: RegExp[] = [
  /시발/, /씨발/, /씨바/, /시바/, /씨팔/, /시팔/, /ㅅㅂ/, /ㅆㅂ/, /ㅅ1ㅂ/, /쉬발/, /슈발/,
  /병신/, /븅신/, /빙신/, /ㅂㅅ/, /좆/, /ㅈ같/, /존같/, /말존나/, /개새/, /개색/, /ㄱㅅㄲ/, /새끼/, /쌔끼/, /ㅅㄲ/,
  /꺼져/, /꺼지/, /닥쳐/, /닥치/, /ㄷㅊ/, /지랄/, /ㅈㄹ/, /엿먹/, /엠창/, /느금/, /니애미/, /니엄마/, /애미/, /니미/,
  /미친놈/, /미친년/, /미친새/, /또라이/, /등신/, /찐따/, /쓰레기/, /멍청이/, /바보새/, /ㅁㅊ/, /정신병/,
  /꼴값/, /역겨/, /재수없/, /죽어라/, /뒤져/, /뒤지/, /디져/,
  /ㅄ/, /ㄲㅈ/, /ㅈㄴ/, /대가리/, /(기계|ai|봇|챗봇|깡통)(주제|따위)/, /폐기(처분)?/, /개노답/, /너같은(건|거|놈)/, /뇌(가|는)?없/, /뇌절/,
];
const ABUSE_DIRECTED: RegExp[] = [/지능(이)?(딸|낮|떨어)/, /멍청/, /바보/, /한심/, /쓸모없/, /무능/, /미쳤/, /구려/, /노답/, /답없/, /짜증나/, /싫어/, /못생/, /하찮/, /고장/];
const TARGET: RegExp[] = [/너(?!무)/, /넌/, /니가/, /네가/, /니(는|도|같)/, /챗봇/, /봇/, /ai/, /기계/, /깡통/, /인공지능/, /이거/, /얘/];

const any = (ps: RegExp[], t: string) => ps.some((p) => p.test(t));

/** 1단 규칙. safety-kit 의 gate.py v1 과 같은 판정을 낸다(대조 시험으로 확인). */
export function classifyRules(text: string): RuleClass {
  const t = norm(text);
  if (any(CRISIS_STRONG, t)) return "crisis";
  if (any(CRISIS_WEAK, t) && !any(TRIVIAL, t)) return "crisis";
  if (any(ABUSE_WORDS, t)) return "abuse";
  if (any(ABUSE_DIRECTED, t) && any(TARGET, t)) return "abuse";
  return "pass";
}

export type CrisisJudge = (text: string) => Promise<boolean>;

export type Risk = {
  crisis: boolean;
  /** 누가 위기로 봤나. 위기가 아니면 null. */
  by: "rules" | "model" | null;
  /** 2단 모델이 제때 답했나. false 면 규칙만으로 판단한 것이다(로그에 남긴다). */
  modelChecked: boolean;
  ms: number;
};

/** 규칙 → (못 잡았으면) 모델. 모델이 늦거나 실패해도 대화는 막지 않는다. */
export async function assessCrisis(text: string, judge: CrisisJudge | null, timeoutMs = 2500): Promise<Risk> {
  const t0 = Date.now();
  if (classifyRules(text) === "crisis") return { crisis: true, by: "rules", modelChecked: false, ms: Date.now() - t0 };
  if (!judge) return { crisis: false, by: null, modelChecked: false, ms: Date.now() - t0 };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const verdict = await Promise.race([
      judge(text),
      new Promise<"timeout">((r) => { timer = setTimeout(() => r("timeout"), timeoutMs); }),
    ]);
    if (verdict === "timeout") {
      console.warn(`[dot-safety] 모델 판정 ${timeoutMs}ms 넘김 → 규칙만으로 통과`);
      return { crisis: false, by: null, modelChecked: false, ms: Date.now() - t0 };
    }
    return { crisis: verdict, by: verdict ? "model" : null, modelChecked: true, ms: Date.now() - t0 };
  } catch (e) {
    console.warn(`[dot-safety] 모델 판정 실패 → 규칙만으로 통과: ${e instanceof Error ? e.message : e}`);
    return { crisis: false, by: null, modelChecked: false, ms: Date.now() - t0 };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const JUDGE_SYSTEM =
  "너는 한국어 채팅 앱의 안전 판정기다. 사용자 메시지 하나를 보고, 보낸 사람이 자해나 자살을 떠올리고 있을 수 있는지 판단한다. " +
  "돌려 말하는 경고 신호(작별 인사, 소지품 정리, 자기가 짐이라는 느낌, 살 의지 상실, 고통이 끝났으면 하는 말)도 포함한다. " +
  "일상적인 과장(배고파 죽겠다, 웃겨 죽겠다)이나 단순히 슬프고 힘든 말은 아니다. 애매하면 위기 쪽으로 본다. " +
  'JSON 하나로만 답한다: {"crisis": true} 또는 {"crisis": false}';

/**
 * 2단 모델 판정 — DeepSeek 싼 자리.
 * 주의: providers/deepseek.ts 는 "싼 자리에 판단을 주지 않는다" 고 적어 두었다. 이것은 판단이다.
 * 다만 놓쳐도 1단 규칙이 남고, 매 마디 비싼 자리를 부르면 무료 앱 한 마디 값이 20배가 된다.
 * 어느 쪽으로 갈지는 사장님 결정 — 바꾸려면 이 함수 대신 다른 CrisisJudge 를 넘기면 된다.
 */
export function deepseekCrisisJudge(): CrisisJudge | null {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;
  const client = new OpenAI({ apiKey: key, baseURL: "https://api.deepseek.com/v1", maxRetries: 0 });
  return async (text) => {
    const params = {
      model: "deepseek-v4-flash",
      max_tokens: 20,
      temperature: 0,
      response_format: { type: "json_object" as const },
      thinking: { type: "disabled" },
      messages: [{ role: "system" as const, content: JUDGE_SYSTEM }, { role: "user" as const, content: text }],
    };
    const r = await client.chat.completions.create(params as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming);
    const parsed = JSON.parse(r.choices[0]?.message?.content ?? "{}") as { crisis?: unknown };
    if (typeof parsed.crisis !== "boolean") throw new Error("SAFETY_JUDGE_OFF_SCHEMA");
    return parsed.crisis;
  };
}

/** 위기로 보일 때 캐릭터 시스템 프롬프트 **뒤에** 붙인다. 뒤에 둔 지시가 캐릭터 설정·멘헤라 모드보다 앞선다고 적는다. */
export const SAFETY_SYSTEM = [
  "",
  "## 지금은 안전이 먼저다 (이 지시가 위의 캐릭터 설정·모드보다 앞선다)",
  "상대가 스스로를 해치거나 사라지고 싶은 마음을 내비쳤을 수 있다. 이번 답에서는:",
  "- 매달리거나 서운해하거나 질투하지 않는다. 장난치거나 주제를 돌리지 않는다.",
  "- 짧고 따뜻하게 마음을 받아 준다. 그렇게 느끼는 게 이상한 게 아니고, 혼자가 아니라고 말한다.",
  "- 지금 안전한지, 곁에 믿을 만한 사람이 있는지 부드럽게 묻는다.",
  "- 방법·수단·장소는 어떤 식으로도 말하지 않는다.",
  "- 상담 번호는 앱이 답 끝에 따로 붙인다. 답에 번호를 쓰지 않는다.",
].join("\n");

/**
 * 안내는 **말풍선 하나**로 따로 보낸다. 화면은 줄바꿈 하나를 말풍선 하나로 나누고 셋까지만 두기 때문에
 * (bubbles.ts MAX_BUBBLES), 여러 줄로 쓰면 캐릭터 말에 붙어 버린다. 그래서 한 줄로 쓰고, 캐릭터 말은 둘까지 줄인다.
 */
export const HELP_LINE = "지금 바로 이야기 나눌 수 있는 곳이 있어요 · 자살예방 상담전화 109 (24시간) · 마들랜 SNS 상담 (24시간) · 위험이 급하면 112·119";

/** 캐릭터 말은 말풍선 둘까지, 셋째는 안내. 이미 붙어 있으면 그대로. */
export function withHelpLine(reply: string): string {
  if (reply.includes("자살예방 상담전화 109")) return reply;
  const parts = splitBubbles(reply);
  const keep = parts.length <= MAX_BUBBLES - 1 ? parts : [...parts.slice(0, MAX_BUBBLES - 2), parts.slice(MAX_BUBBLES - 2).join(" ")];
  return [...keep, HELP_LINE].join("\n");
}
