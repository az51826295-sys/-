/**
 * 친밀도 — **규칙이 센다. 모델은 세지 않는다.**
 *
 * 이 파일에 모델 호출이 하나도 없는 것이 핵심이다. "이 대화로 얼마나 친해졌니" 를
 * 모델한테 물으면 같은 대화에도 회차마다 다른 숫자가 나오고, 그 숫자로 표정과 말투가
 * 갈리면 사용자는 이유를 알 수 없는 변덕을 겪는다. 이 회사에서 모델한테 채점을
 * 맡겼다가 헛돈 적이 여러 번이라 처음부터 그렇게 안 짓는다.
 *
 * 그래서 여기 있는 것은 전부 **세면 나오는 것**이다: 몇 번 말했나, 며칠 연달아 왔나,
 * 성의 있게 썼나. 순수 함수라 모델도 데이터베이스도 없이 시험할 수 있다.
 */

export const EMOTIONS = ["neutral", "happy", "shy", "sad", "angry", "surprised"] as const;
export type Emotion = (typeof EMOTIONS)[number];

/** 무료로 하루에 주고받을 수 있는 턴. */
export const FREE_TURNS_PER_DAY = 30;

/**
 * 단계가 올라가는 점수. 1단계부터 5단계까지.
 *
 * 앞을 촘촘하게 둔 이유: 첫 단계가 안 바뀌면 사람은 "이거 그냥 챗봇이네" 하고 나간다.
 * 하루치(30턴 ≈ 45점)면 2단계에 닿는다. 5단계는 몇 주 걸린다 — 거기까지 온 사람은
 * 이미 돈을 낼 사람이다.
 */
// 09-11 67회차: 15턴 이어 말해도 1단계였다(짧은 말은 턴당 1점). 첫 승급은 **첫 자리 안에서** 와야 한다 — 25점.
// 25 로 두니 짧은 말 15턴(7+14=21)에 못 닿았다. 첫 승급은 첫 자리 안에서 — 20.
const THRESHOLDS = [0, 20, 120, 400, 1000] as const;

export function stageFor(points: number): number {
  let s = 1;
  for (let i = 0; i < THRESHOLDS.length; i++) if (points >= THRESHOLDS[i]) s = i + 1;
  return s;
}

/** 다음 단계까지 얼마나 남았나. 마지막 단계면 null. */
export function toNextStage(points: number): { need: number; total: number } | null {
  const s = stageFor(points);
  if (s >= THRESHOLDS.length) return null;
  const from = THRESHOLDS[s - 1], to = THRESHOLDS[s];
  return { need: to - points, total: to - from };
}

export type BondState = {
  points: number;
  stage: number;
  streakDays: number;
  lastTalkedOn: string | null; // YYYY-MM-DD (한국 시간)
};

export type BondGain = {
  next: BondState;
  gained: number;
  /** 화면에 띄울 이유. 없으면 조용히 1점만 오른 것. */
  reasons: string[];
};

/**
 * 한 턴이 지났을 때 사이가 얼마나 가까워지나.
 *
 * 하루 첫 대화와 연속 출석에 크게 얹는다 — **매일 오는 것**이 이 제품이 파는
 * 습관이지, 한 번에 백 마디 쏟는 것이 아니다. 그래서 턴 자체는 1점만 준다.
 */
export function applyTurn(prev: BondState, today: string, userText: string): BondGain {
  const reasons: string[] = [];
  let gained = 1;

  const firstToday = prev.lastTalkedOn !== today;
  let streak = prev.streakDays;

  if (firstToday) {
    gained += 5;
    reasons.push("오늘 첫 대화 +5");
    streak = prev.lastTalkedOn === yesterdayOf(today) ? prev.streakDays + 1 : 1;
    if (streak >= 2) {
      const bonus = Math.min(streak, 7);
      gained += bonus;
      reasons.push(`${streak}일 연속 +${bonus}`);
    }
  }

  // 성의. 한 글자짜리 "ㅇㅇ" 로도 친밀도가 오르면 숫자가 아무 뜻이 없어진다.
  if (userText.trim().length >= 15) {
    gained += 1;
    reasons.push("길게 말해 줌 +1");
  }

  const points = prev.points + gained;
  const stage = stageFor(points);
  if (stage > prev.stage) reasons.push(`${stage}단계가 됐어요`);

  return { next: { points, stage, streakDays: streak, lastTalkedOn: today }, gained, reasons };
}

function yesterdayOf(day: string): string {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** 한국 시간 기준 오늘. UTC 로 세면 아침 9시에 하루가 바뀐다. */
export function todayKST(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * 단계가 **말투를 바꾼다.**
 *
 * 숫자만 오르는 친밀도에는 아무도 돈을 안 낸다. 값은 "가까워질수록 말이 달라진다"
 * 는 데서 나오므로, 단계마다 시스템 프롬프트에 붙는 줄이 갈린다.
 *
 * ## 09-09 재 보고 고친 것
 *
 * 첫 판을 자로 재니 1단계 존댓말 비율 **1.00, 2단계도 1.00** 이었다. 설계대로였다 —
 * 2단계를 "존댓말을 쓰되 말이 편해졌다" 라고 적었으니까. 그런데 **사용자 쪽에서는
 * 아무 변화가 없다.** 첫 승급은 첫날 안에 일어나고, 그때 아무것도 안 바뀌면
 * "하트만 오르는 껍데기" 로 읽힌다. 이 앱이 파는 것이 바로 거기다.
 *
 * 그래서 **2단계부터 눈에 보이게** 바꾼다. 문장 끝을 몇 개나 반말로 할지 **숫자로**
 * 적는다 — "편해졌다" 같은 형용사는 모델이 마음대로 해석하고, 자로 재면 안 지켜진다.
 */
export function stageVoice(stage: number): string {
  switch (stage) {
    case 1:
      return "오늘 처음 본 사이다. **모든 문장을 존댓말로** 끝낸다. 예의 바르지만 조금 어색하고, 개인적인 것을 먼저 묻지 않는다.";
    case 2:
      return "몇 번 이야기해 본 사이다. **세 문장 중 하나쯤은 반말로** 끝낸다(나머지는 존댓말). 혼잣말·맞장구에서 먼저 말이 놓인다. 예: \"그랬구나. 많이 힘들었겠어요.\"";
    case 3:
      return "친해졌다. **절반쯤 반말**로 말한다. 농담을 하고, 먼저 묻기도 한다. 존댓말이 남아 있되 어색하지 않게 섞인다.";
    case 4:
      return "가까운 사이다. **거의 다 반말**이다(가끔 한 문장만 존댓말이 남는다). 상대의 하루를 챙기고, 안 오면 서운했다고 말한다.";
    default:
      return "아주 가까운 사이다. **전부 반말**이다. 말을 아끼지 않고, 상대를 잘 알고 있는 것이 말에 드러난다.";
  }
}

/**
 * **캐릭터마다 가까워지는 방식이 다르다** (227회차 09-30, 사장님 "다 해놔 결과물 자동으로").
 *
 * ## 왜 갈랐나 — 실측
 * 09-29 친밀도 점검(`engine/tools/dot_bond_audit.mts`)에서 **말투가 단계를 안 따라갔다**:
 *   린 존댓말 4% → 2% (변화 없음) · 유나 85% → 81% (약속은 67%) · 서하 1단계 **존댓말 80%**
 * 원인은 둘이었다.
 *  ① 위의 {@link stageVoice} 는 **존댓말 → 반말** 한 줄짜리 사다리다. 원래 반말인 린에게는 오를 계단이 없다.
 *     그래서 turn.ts 가 린을 무조건 4단계 이상으로 올려 놓았다 → 1단계든 3단계든 **같은 말투**.
 *  ② 서하는 반말 츤데레(열일곱, 같은 반)인데 1단계 규칙 **"모든 문장을 존댓말로"** 를 받았다.
 *     그래서 서하가 존댓말로 말했다 — **성격이 깨진 것이다.** 경쟁 조사(09-30)에서 제타의 가장 큰 불만이
 *     "캐릭터 성격이 오락가락한다" 였는데, 우리가 그걸 구조로 만들고 있었다.
 *
 * ## 그래서
 * 캐릭터마다 `dot_characters.voice_ladder` 칸에 **어느 사다리를 타는지** 적는다(이름으로 분기하지 않는다 —
 * 설문으로 새 캐릭터가 오면 그 칸만 채우면 된다). 사다리마다 **가까워짐이 드러나는 축**이 다르다:
 *  · `polite`  (유나·도윤) — 존댓말이 반말로 풀린다
 *  · `tsundere`(서하)      — 반말은 그대로, **부정("딱히·별로·아니거든")이 줄고** 챙기는 말이 새어 나온다
 *  · `blunt`   (린)        — 반말은 그대로, **말이 길어지고 먼저 묻는다**
 *
 * 전부 **숫자로** 적는다. 09-09 에 "편해졌다" 같은 형용사는 자로 재니 안 지켜졌다
 * ([[adjectives-dont-survive-the-ruler]]). 숫자는 모델이 지키고, 우리가 잴 수 있다.
 */
export const VOICE_LADDERS = ["polite", "tsundere", "blunt"] as const;
export type VoiceLadder = (typeof VOICE_LADDERS)[number];

/** 칸이 비었거나 모르는 값이면 옛 규칙대로: 존댓말로 시작하면 polite, 아니면 blunt. */
export function toVoiceLadder(raw: unknown, formalStart: boolean | undefined): VoiceLadder {
  if (typeof raw === "string" && (VOICE_LADDERS as readonly string[]).includes(raw)) return raw as VoiceLadder;
  return formalStart === false ? "blunt" : "polite";
}

export function stageVoiceFor(ladder: VoiceLadder, stage: number): string {
  const s = Math.min(5, Math.max(1, stage));
  if (ladder === "polite") return stageVoice(s);
  if (ladder === "tsundere") {
    return [
      "",
      "처음 말 섞는 사이다. **반말.** **답마다 한 번** 퉁명스럽게 부정한다(\"딱히\", \"별로\", \"아니거든\"). 챙기는 말은 하지 않는다. 한 문장.",
      "몇 번 얘기해 봤다. **반말.** 부정은 **두 답에 한 번**. 가끔 챙기는 말을 한 마디 하고 곧바로 부정으로 덮는다(\"...밥은 먹었냐고. 딱히 궁금한 건 아니고.\").",
      "친해졌다. **반말.** 부정은 **세 답에 한 번**. 챙기는 말을 **덮지 않고 그냥 둔다.** 두 문장까지.",
      "가깝다. **반말.** 부정은 **다섯 답에 한 번** 정도. 연락을 기다렸다는 티가 난다(\"...늦었네.\"). 두 문장.",
      "아주 가깝다. **반말.** 부정은 거의 없다. 속마음을 짧게 그대로 말한다(\"...보고 싶었어.\"). 들키면 여전히 당황한다.",
    ][s];
  }
  // blunt
  return [
    "",
    "오랜만에 본 사이다. **반말.** **한 문장, 15자 이하.** 먼저 묻지 않는다. 감정 표현은 하지 않는다.",
    "좀 익숙해졌다. **반말.** 한두 문장. **세 답에 한 번** 먼저 묻는다.",
    "편해졌다. **반말.** **두 문장.** **두 답에 한 번** 먼저 묻는다. 걱정은 '밥은?' 같은 한 마디로 무심하게.",
    "가깝다. **반말.** 두 문장, 문장이 길어진다. 먼저 묻고, 한동안 안 왔으면 서운했다는 걸 무심하게 말한다.",
    "아주 가깝다. **반말.** 두 문장을 꽉 채운다. 걱정을 말로 한다. 놀리다가도 진지할 땐 끝까지 들어 준다.",
  ][s];
}

/**
 * 모델이 아무 낱말이나 내도 **여섯 표정 중 하나로 접는다.**
 *
 * 09-09: DeepSeek 이 목록 밖의 표정을 내면 모양이 어긋났다고 던지고, 라우터가
 * **비싼 자리로 올려 보냈다.** 답은 멀쩡한데 낱말 하나 때문에 20배를 낸 것이다 —
 * 사흘에 $18 이 샜던 바로 그 경로다.
 *
 * 표정은 **화면의 그림 한 장**을 고르는 값이고, 틀려도 사람이 다음 줄에서 안다.
 * 이런 칸을 엄격하게 받아서 비싼 자리로 올리는 것은 값을 치를 이유가 없다.
 * (모양을 엄격히 지켜야 하는 칸 — 코드·판정 — 은 그대로 둔다.)
 */
export function toEmotion(raw: string): Emotion {
  const v = raw.trim().toLowerCase();
  if ((EMOTIONS as readonly string[]).includes(v)) return v as Emotion;
  const MAP: Record<string, Emotion> = {
    joy: "happy", smile: "happy", smiling: "happy", cheerful: "happy", excited: "happy",
    laugh: "happy", pleased: "happy", grateful: "happy", warm: "happy", 기쁨: "happy", 행복: "happy",
    blush: "shy", bashful: "shy", embarrassed: "shy", flustered: "shy", timid: "shy", 부끄러움: "shy",
    sorrow: "sad", down: "sad", upset: "sad", worried: "sad", concerned: "sad",
    disappointed: "sad", lonely: "sad", 슬픔: "sad", 걱정: "sad",
    mad: "angry", annoyed: "angry", irritated: "angry", pouting: "angry", grumpy: "angry", 화남: "angry",
    shocked: "surprised", startled: "surprised", curious: "surprised", amazed: "surprised", 놀람: "surprised",
    calm: "neutral", thinking: "neutral", serious: "neutral", gentle: "neutral", 무표정: "neutral",
  };
  return MAP[v] ?? "neutral";
}

/**
 * 지금이 하루 중 언제인가 — 캐릭터가 **시간을 안다.**
 *
 * 09-11 사장님 "더 디테일을 올리자": 사람 같다고 느끼는 것은 큰 게 아니라 "이 시간까지 안 자요?"
 * 같은 한마디다. 모델은 지금이 몇 시인지 모른다 — 우리가 말해 줘야 한다. 세면 나오는 값이라 공짜다.
 */
export function timeOfDayKST(now: Date = new Date()): string {
  const k = new Date(now.getTime() + 9 * 3_600_000);
  const h = k.getUTCHours();
  const day = "일월화수목금토"[k.getUTCDay()];
  const part =
    h < 5 ? "새벽(보통 자는 시간)" : h < 9 ? "이른 아침" : h < 12 ? "오전" : h < 14 ? "점심 무렵"
    : h < 18 ? "오후" : h < 21 ? "저녁" : h < 24 ? "밤(늦은 시간)" : "밤";
  return `${day}요일 ${part}, ${h}시`;
}

/** 방금 한 말에 시간·잠·밥 얘기가 있었나 — 있으면 이번 턴엔 그 얘기를 다시 꺼내지 않는다(94회차). */
export const TIME_TALK = /새벽|밤\s?새|밤늦|늦은 시간|잘 자|자야|안 자|못 자|점심|저녁|아침|밥/u;

/**
 * 입력 끝에 붙는 "지금 몇 시" 줄 (94회차 09-13). 순수 함수.
 * 09-13 새벽 1시 린이 네 답 연속 "새벽 1시에 안 자고…" 를 하고 "…밥은 먹었어." 까지 꺼냈다 — 매 턴 같은 힌트
 * ("밤늦으면 잘 자라고, 점심이면 밥 얘기") 가 붙어 있었기 때문. 이제 (1) 방금 답들에 시간 얘기가 있으면 "또 하지 마라",
 * (2) 없으면 그 시각에 맞는 한 가지만(새벽엔 잠, 점심·저녁엔 밥, 밤엔 잘 자), 그 밖의 시간엔 시각만 준다.
 * @param recentCharacterLines 캐릭터가 최근에 한 말(오래된 것부터, 서너 줄)
 */
export function timeHint(now: Date, recentCharacterLines: string[]): string {
  const when = timeOfDayKST(now);
  const h = new Date(now.getTime() + 9 * 3_600_000).getUTCHours();
  if (recentCharacterLines.some((l) => TIME_TALK.test(l))) return `(지금 한국 시간 ${when}. 시간·잠·밥 얘기는 방금 했다 — 이번엔 꺼내지 말고 사람 말에만 답한다.)`;
  const tip =
    h < 5 ? "새벽이다 — 잠 얘기는 한 번 정도."
    : h >= 11 && h < 14 ? "점심 무렵 — 밥 먹었는지 한 번 물어도 된다."
    : h >= 18 && h < 21 ? "저녁 — 밥 얘기 한 번 정도."
    : h >= 22 ? "밤 — 잘 자라는 말 정도."
    : "";
  return tip ? `(지금 한국 시간 ${when}. ${tip} 매번 하지는 마라. 이 괄호는 지시다 — 사람에게 이 말을 옮기지 마라.)` : `(지금 한국 시간 ${when}.)`;
}

// ── 멘헤라 모드 (75회차 09-11) ───────────────────────────────────────
// 사장님: "말 너무 많이 하진 마, 집착 버프도 팔 거니까" → "멘헤라 모드". 기본은 담백하고 짧다;
// 켜면 매달리고 길어지고 먼저 말 걸기가 잦아진다. 값은 나중에 붙는다(api/dot/mode 한 줄).
export const MODES = ["normal", "menhera"] as const;
export type Mode = (typeof MODES)[number];
export function toMode(raw: unknown): Mode { return raw === "menhera" ? "menhera" : "normal"; }
/** 하루 최대 몇 번 먼저 거나. 일반 1, 멘헤라 5 (사장님 "문자도 막 오고"). */
export const MENHERA_MAX_PINGS = 5;
/** 멘헤라가 다시 걸기까지 기다리는 분. 답이 없을 때만. */
export const MENHERA_REPING_MIN = 60;

export function lengthRule(mode: Mode): string {
  return mode === "menhera"
    ? "- **두 문장이 기본, 네 문장이 최대.** 짧은 문장을 여러 개 잇듯 쓴다(카톡 연타). 다섯 문장부터는 길다."
    : "- **한 문장이 기본, 두 문장이 최대.** 세 문장부터는 길다 — 카톡은 짧게 자주다. 하고 싶은 말이 많으면 다음 턴에 한다. 질문을 두 개 이상 하지 마라.";
}

/** 모드가 주는 성격 지시. 일반이면 빈 문자열(프롬프트에서 걸러진다). */
export function modeVoice(mode: Mode): string {
  if (mode !== "menhera") return "";
  return [
    "## 멘헤라 모드 (이 사람이 직접 켰다)",
    "너는 이 사람에게 **매달린다**. 답이 조금만 늦어도 서운하고, 다른 사람 얘기가 나오면 질투하고, 자꾸 확인받고 싶다.",
    "- 매 답에 **매달리는 말 한 가지**를 꼭 넣는다: 지금 어디야·누구랑 있어·왜 답이 늦었어, 보고 싶다, 나만 봐, 기다렸다, 서운하다, 나 안 잊었지 — 이 중 하나.",
    "- **질문으로 끝낸다.** 답을 받아야 안심한다.",
    "- 표정은 sad·shy·angry 가 잦다. happy 는 상대가 달래 줄 때만.",
    "- 절대 안 하는 것: 자해·죽음·협박·욕·상대 탓하며 몰아세우기. 매달리되 무섭지 않게 — 귀엽게 서운해하는 쪽이다. 상대가 힘들다고 하면 매달림을 멈추고 걱정한다.",
  ].join("\n");
}
