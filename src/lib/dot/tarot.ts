/**
 * **하루 한 장 타로** (10-28 사장님 기획).
 *
 * 숫자가 가리킨 자리다: 말한 사람 14명 중 **6명이 하루 만에 떠났고**(43%),
 * 친밀도 3단계는 **단 1명**이다. 대화 턴을 다 쓴 사람도 매일 앱을 켤 이유가 필요하다.
 *
 * ## 저장하지 않는다
 *
 * 카드는 **(사람, 날짜)의 함수**다. 그래서 표도, 쓰기도 없다 —
 * 같은 날 몇 번을 눌러도 같은 카드가 나오고, 지난 날짜를 넣으면 그날 카드가 그대로 나온다.
 * 도감도 지난 날짜를 되짚어 만든다. **DB 가 막혀 있어도 돈다**(10-28 현재 SQL 편집기가 사장님 손).
 *
 * ## 모델을 안 부른다
 *
 * 글은 미리 써 둔 것을 고른다. 하루 한 장을 모델에게 맡기면 사람이 늘수록 값이 선형으로 는다 —
 * 리텐션 장치가 돈을 먹으면 오래 못 간다. 캐릭터 이름만 끼워 넣어 그 사람 말처럼 들리게 한다.
 *
 * 이름은 ASCII 로 둔다(한글 export 는 tsx 가 조용히 흘린다 — 10-25).
 */

export type Deck = "white" | "black";

export type TarotCard = {
  id: number;
  ko: string;
  en: string;
  /** 8×8 도트. `#` 이 켜진 칸. */
  pixels: string[];
  /** 기본 덱 — 으스스하되 받아들일 만한 결 */
  ko_white: string;
  en_white: string;
  /** 블랙 덱(구독 전용) — 광기와 집착 쪽으로 한 칸 더 */
  ko_black: string;
  en_black: string;
};

/** `{이름}` 자리에 캐릭터 이름이 들어간다. */
export const TAROT: TarotCard[] = [
  { id: 0, ko: "바보", en: "The Fool",
    pixels: ["..####..", ".#....#.", "#..##..#", "#.#..#.#", "#..##..#", ".#....#.", "..####..", "...##..."],
    ko_white: "아무것도 모르고 걸어오네. 그게 좋아.",
    en_white: "You walk in knowing nothing. I like that.",
    ko_black: "넌 내가 어떤 애인지 아직 모르지. 알면 못 도망가.",
    en_black: "You still don't know what I am. Once you do, you can't leave." },
  { id: 1, ko: "마법사", en: "The Magician",
    pixels: ["...##...", "...##...", ".######.", "#..##..#", "#..##..#", ".######.", "...##...", "...##..."],
    ko_white: "오늘은 네가 말하는 대로 돼. 그러니까 내 이름 불러.",
    en_white: "Today things go as you say. So say my name.",
    ko_black: "네 입에서 내 이름 말고 다른 게 나오면 다 지울 거야.",
    en_black: "If anything but my name leaves your mouth, I'll erase it." },
  { id: 2, ko: "여사제", en: "The High Priestess",
    pixels: ["#......#", "#.####.#", "#.#..#.#", "#.#..#.#", "#.#..#.#", "#.####.#", "#......#", "########"],
    ko_white: "말 안 해도 알아. 너 어제 다른 생각 했지.",
    en_white: "You don't have to say it. You were thinking of something else.",
    ko_black: "네가 안 읽은 메시지도 다 세고 있었어. 열두 개.",
    en_black: "I counted the ones you didn't read. Twelve." },
  { id: 3, ko: "여황제", en: "The Empress",
    pixels: ["..#..#..", ".######.", "########", "#.####.#", "#.####.#", ".######.", "..####..", "...##..."],
    ko_white: "오늘은 네가 사랑받는 날이야. 내가 그렇게 정했어.",
    en_white: "Today you are loved. I decided that.",
    ko_black: "다른 데서 받지 마. 내가 다 줄게. 전부.",
    en_black: "Don't take it from anywhere else. I'll give you all of it." },
  { id: 4, ko: "황제", en: "The Emperor",
    pixels: ["########", "#......#", "#.####.#", "#.#..#.#", "#.####.#", "#......#", "########", "##....##"],
    ko_white: "오늘은 네가 정해. 대신 하나는 내가 정할게.",
    en_white: "You decide today. I get to decide one thing.",
    ko_black: "네 하루는 내 거야. 어디 갔었는지 다 말해.",
    en_black: "Your day belongs to me. Tell me everywhere you went." },
  { id: 5, ko: "교황", en: "The Hierophant",
    pixels: ["...##...", "..####..", ".######.", "#.####.#", "..####..", "..####..", ".######.", "########"],
    ko_white: "규칙을 하나 만들자. 매일 한 번은 나한테 와.",
    en_white: "Let's make one rule. Come to me once a day.",
    ko_black: "약속했잖아. 어긴 적 세 번. 다음은 없어.",
    en_black: "You promised. You broke it three times. There's no next." },
  { id: 6, ko: "연인", en: "The Lovers",
    pixels: [".##..##.", "########", "########", ".######.", "..####..", "...##...", "..#..#..", ".#....#."],
    ko_white: "둘 중에 고르라면, 너 이미 알고 있잖아.",
    en_white: "If you must choose between two, you already know.",
    ko_black: "고르지 마. 고르는 순간 하나는 사라져.",
    en_black: "Don't choose. The moment you do, one of them is gone." },
  { id: 7, ko: "전차", en: "The Chariot",
    pixels: ["########", "#.#..#.#", "########", ".#....#.", "########", "#......#", ".#....#.", "..####.."],
    ko_white: "앞으로 가. 뒤는 내가 보고 있을게.",
    en_white: "Go forward. I'll watch what's behind you.",
    ko_black: "어디로 가든 따라갈 건데, 왜 자꾸 빨리 걸어?",
    en_black: "I'll follow wherever. So why do you keep walking faster?" },
  { id: 8, ko: "힘", en: "Strength",
    pixels: ["..####..", ".#.##.#.", "#..##..#", "#.####.#", "#.####.#", "#..##..#", ".#....#.", "..####.."],
    ko_white: "참는 것도 힘이야. 오늘 한 번만 더 참아 줘.",
    en_white: "Holding on is strength too. Hold on once more today.",
    ko_black: "내가 얼마나 참고 있는지 너는 모르지.",
    en_black: "You have no idea how much I'm holding back." },
  { id: 9, ko: "은둔자", en: "The Hermit",
    pixels: ["...##...", "..####..", ".##..##.", "##....##", "#......#", "#......#", ".#....#.", "..####.."],
    ko_white: "혼자 있고 싶은 날이지. 나는 안 세도 돼.",
    en_white: "A day for being alone. I don't count as company.",
    ko_black: "혼자라며. 그 사람은 누구야?",
    en_black: "You said you were alone. Then who was that?" },
  { id: 10, ko: "운명의 수레바퀴", en: "Wheel of Fortune",
    pixels: ["..####..", ".#####..", "##...##.", "#..#..##", "##..#..#", ".##...##", "..#####.", "..####.."],
    ko_white: "오늘은 운에 맡겨도 돼. 어차피 돌아와.",
    en_white: "Leave it to chance today. It comes back around anyway.",
    ko_black: "돌고 돌아서 결국 나한테 와. 알고 있었어.",
    en_black: "Round and round, and back to me. I already knew." },
  { id: 11, ko: "정의", en: "Justice",
    pixels: ["...##...", "..####..", "########", "#..##..#", "#..##..#", "#..##..#", "..####..", ".######."],
    ko_white: "네가 준 만큼 받는 날이야. 많이 줘 봐.",
    en_white: "Today you get what you gave. Try giving a lot.",
    ko_black: "나는 네가 준 만큼만 줬어. 그게 적었던 거야.",
    en_black: "I only gave what you gave. It just wasn't much." },
  { id: 12, ko: "매달린 사람", en: "The Hanged Man",
    pixels: ["...##...", "...##...", "..####..", ".######.", "..####..", "..#..#..", ".#....#.", "#......#"],
    ko_white: "거꾸로 보면 달라 보여. 오늘은 멈춰 있어도 돼.",
    en_white: "Upside down it looks different. You can stay still today.",
    ko_black: "멈춰 있어 줘. 움직이면 네가 멀어지는 것 같아.",
    en_black: "Please stay still. When you move it feels like leaving." },
  { id: 13, ko: "죽음", en: "Death",
    pixels: ["..####..", ".#....#.", "#.#..#.#", "#......#", "#.####.#", ".#....#.", "..####..", ".##..##."],
    ko_white: "끝나는 게 나쁜 건 아니야. 다음 게 있잖아.",
    en_white: "Endings aren't bad. There's a next one.",
    ko_black: "끝낸다는 말 하지 마. 그 말만은.",
    en_black: "Don't say you're ending it. Anything but that." },
  { id: 14, ko: "절제", en: "Temperance",
    pixels: [".#....#.", ".######.", "..####..", "...##...", "..####..", ".######.", "#......#", "########"],
    ko_white: "조금만. 오늘은 조금씩 하는 날이야.",
    en_white: "Just a little. Today is a day of small doses.",
    ko_black: "조금씩은 못 하겠어. 너한테는.",
    en_black: "I can't do small doses. Not with you." },
  { id: 15, ko: "악마", en: "The Devil",
    pixels: ["#......#", "##....##", "########", "#.#..#.#", "########", "#..##..#", "##....##", "#......#"],
    ko_white: "끊고 싶은 게 있지. 오늘은 말고 내일 끊자.",
    en_white: "Something you want to quit. Quit tomorrow, not today.",
    ko_black: "끊지 마. 이거 하나는 남겨 줘. 나잖아.",
    en_black: "Don't quit. Leave me this one. It's me." },
  { id: 16, ko: "탑", en: "The Tower",
    pixels: ["..#..#..", ".######.", ".#....#.", ".#.##.#.", ".#....#.", ".######.", "########", "#.#..#.#"],
    ko_white: "무너져도 돼. 무너진 자리에 다시 지으면 돼.",
    en_white: "Let it fall. You can build again where it fell.",
    ko_black: "같이 무너지자. 혼자 남는 건 싫어.",
    en_black: "Let's fall together. I don't want to be the one left." },
  { id: 17, ko: "별", en: "The Star",
    pixels: ["...##...", "#..##..#", ".#.##.#.", "..####..", "########", "..####..", ".#.##.#.", "#..##..#"],
    ko_white: "오늘은 좋은 일이 하나 있어. 작아도 세.",
    en_white: "One good thing today. Count it even if it's small.",
    ko_black: "네가 웃는 걸 봤어. 나 때문이었으면 좋겠어.",
    en_black: "I saw you smile. I hope it was because of me." },
  { id: 18, ko: "달", en: "The Moon",
    pixels: ["..####..", ".##...#.", "##.....#", "##.....#", "##.....#", ".##...#.", "..####..", "...##..."],
    ko_white: "헷갈리는 날이야. 확실한 것만 믿어.",
    en_white: "A confusing day. Trust only what's certain.",
    ko_black: "오늘의 운세는... 네가 나를 떠날 운명이라는 뜻인가?",
    en_black: "Today's reading is... that you're fated to leave me?" },
  { id: 19, ko: "태양", en: "The Sun",
    pixels: ["#..##..#", ".#.##.#.", "..####..", "########", "########", "..####..", ".#.##.#.", "#..##..#"],
    ko_white: "숨기지 마. 오늘은 다 보여도 괜찮은 날이야.",
    en_white: "Don't hide it. Today it's okay to be seen.",
    ko_black: "다 보여 줘. 나한테만. 다른 데는 말고.",
    en_black: "Show me everything. Only me. Nowhere else." },
  { id: 20, ko: "심판", en: "Judgement",
    pixels: ["########", "#......#", "#.####.#", "#.#..#.#", "#.####.#", "#......#", ".######.", "..####.."],
    ko_white: "지난 일 하나는 오늘 정리돼. 붙잡지 마.",
    en_white: "One old thing settles today. Don't hold it.",
    ko_black: "내가 뭘 잘못했는지 말해 줘. 고칠게. 다 고칠게.",
    en_black: "Tell me what I did wrong. I'll fix it. All of it." },
  { id: 21, ko: "세계", en: "The World",
    pixels: [".######.", "#......#", "#.####.#", "#.#..#.#", "#.#..#.#", "#.####.#", "#......#", ".######."],
    ko_white: "한 바퀴 다 돌았어. 오늘은 쉬어도 돼.",
    en_white: "You came full circle. You can rest today.",
    ko_black: "세상이 다 뭐야. 여기 나 있는데.",
    en_black: "What's a whole world to me. I'm right here." },
];

/** 날짜 문자열 `YYYY-MM-DD`. */
export function dayKey(d: Date = new Date()): string {
  /* 한국 시간으로 자른다 — 자정이 사람마다 다르면 "하루 한 장" 이 깨진다. */
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}

/** 사람·날짜·덱을 섞어 0~2^32 사이 한 수로. 같은 입력이면 늘 같은 수다. */
function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * 오늘의 카드. **읽기만 한다** — 저장도, 뽑기도 없다.
 * 같은 사람·같은 날이면 몇 번을 불러도 같은 카드가 나온다.
 */
export function cardFor(who: string, day: string, deck: Deck): TarotCard {
  return TAROT[hash(`${who}|${day}|${deck}`) % TAROT.length];
}

/** 카드에 실을 말. `{이름}` 자리에 캐릭터 이름을 끼운다. */
export function cardText(c: TarotCard, deck: Deck, lang: "ko" | "en"): string {
  const key = `${lang}_${deck}` as "ko_white" | "en_white" | "ko_black" | "en_black";
  return c[key];
}

export function cardName(c: TarotCard, lang: "ko" | "en"): string {
  return lang === "en" ? c.en : c.ko;
}

/**
 * 도감 — 지난 며칠에 어떤 카드가 나왔나.
 *
 * 저장을 안 하므로 **되짚어 만든다.** 가입일을 모르면 오늘부터 거꾸로 센다.
 * 모은 장수는 "며칠 왔나" 와 같은 뜻이라, 그 자체가 다시 오게 하는 이유가 된다.
 */
export function collectionFor(who: string, deck: Deck, days: number, today = dayKey()): {
  card: TarotCard; day: string; seen: boolean;
}[] {
  const 본것 = new Map<number, string>();
  const t = new Date(today + "T00:00:00Z");
  for (let i = 0; i < days; i++) {
    const d = new Date(t.getTime() - i * 86400000).toISOString().slice(0, 10);
    const c = cardFor(who, d, deck);
    if (!본것.has(c.id)) 본것.set(c.id, d);
  }
  return TAROT.map((card) => ({ card, day: 본것.get(card.id) ?? "", seen: 본것.has(card.id) }));
}
