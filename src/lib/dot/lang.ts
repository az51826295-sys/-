/**
 * **한국어 / English** (10-28 사장님 기획 4번).
 *
 * 무거운 i18n 꾸러미를 안 쓴다. 지금 번역할 글이 수십 줄이고, 꾸러미를 넣으면
 * 첫 글자까지의 시간이 는다 — 두근도트에서 그게 제일 비싼 값이다.
 *
 * 고른 언어는 **이 기기에 남는다**(로그인 없이 쓰는 앱이라 계정에 못 묶는다).
 * 처음 온 사람은 브라우저 언어를 따른다 — 물어보지 않는다.
 *
 * 이름은 ASCII 로 둔다(한글 export 는 tsx 가 조용히 흘린다 — 10-25).
 */

export type Lang = "ko" | "en";

const KEY = "dot_lang";

/** 이 기기의 언어. 서버에서는 늘 "ko"(화면은 클라이언트에서 다시 그린다). */
export function getLang(): Lang {
  if (typeof window === "undefined") return "ko";
  try {
    const v = localStorage.getItem(KEY);
    if (v === "ko" || v === "en") return v;
  } catch { /* 못 읽어도 된다 */ }
  /* 안 고른 사람은 브라우저를 따른다. 한국어가 아니면 영어로 본다. */
  const nav = (navigator.language ?? "ko").toLowerCase();
  return nav.startsWith("ko") ? "ko" : "en";
}

export function setLang(l: Lang): void {
  try { localStorage.setItem(KEY, l); } catch { /* 못 써도 된다 */ }
}

/** 화면 글. 키를 한글로 적으면 tsx 가 흘릴 수 있어 ASCII 로 둔다. */
const 말 = {
  tarot_title: { ko: "오늘의 카드", en: "Today's Card" },
  tarot_tap: { ko: "카드를 눌러 뒤집어", en: "Tap the card to flip" },
  tarot_again: { ko: "내일 다시 올 수 있어?", en: "Will you come again tomorrow?" },
  tarot_black: { ko: "블랙 덱", en: "Black Deck" },
  tarot_black_locked: { ko: "멘헤라 모드에서만 열려", en: "Opens with Menhera Mode" },
  tarot_collection: { ko: "모은 카드", en: "Collected" },
  tarot_locked_card: { ko: "아직", en: "Not yet" },
  lang_label: { ko: "언어", en: "Language" },
  feel_label: { ko: "소리와 진동", en: "Sound & vibration" },
  feel_on: { ko: "켬", en: "On" },
  feel_off: { ko: "끔", en: "Off" },
  back: { ko: "뒤로", en: "Back" },
} as const;

export type Key = keyof typeof 말;

export function t(key: Key, lang: Lang): string {
  return 말[key][lang];
}

/** 몇 장 모았는지 같은 문장. 언어마다 어순이 달라 따로 만든다. */
export function collectedLine(n: number, total: number, lang: Lang): string {
  return lang === "en" ? `${n} of ${total} collected` : `${total}장 중 ${n}장`;
}
