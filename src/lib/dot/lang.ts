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

/**
 * 고른 언어를 남긴다. **쿠키에도 적는다** (10-28).
 *
 * 처음에는 localStorage 에만 적었다. 그러면 **서버가 그리는 화면은 영어가 될 수 없다** —
 * 두근도트 화면은 대부분 서버가 그려서, 영어를 골라도 77% 가 한국어로 남았다
 * (사장님 "영어 버튼도 안돼고"). 쿠키는 서버가 읽을 수 있는 유일한 자리다.
 *
 * 계정에 안 묶는 것은 그대로다 — 로그인 없이 쓰는 앱이라 계정에 묶으면 고를 수도 없다.
 */
export function setLang(l: Lang): void {
  try { localStorage.setItem(KEY, l); } catch { /* 못 써도 된다 */ }
  try { document.cookie = `${KEY}=${l};path=/;max-age=31536000;samesite=lax`; } catch { /* 못 써도 된다 */ }
}

/**
 * 쿠키를 이 기기의 언어에 맞춘다. 돌려주는 것: 맞췄더니 **쿠키가 바뀌었나**.
 *
 * 처음 온 영어권 사람은 쿠키가 없어서 서버가 한국어로 그린다. 그 사람이 고르기 전에도
 * 영어를 보게 하려면 **쿠키를 적고 한 번 다시 그려야** 한다. 바뀌었을 때만 true 다 —
 * 늘 true 면 화면이 영원히 다시 그린다.
 */
export function syncLangCookie(): boolean {
  if (typeof document === "undefined") return false;
  const 지금 = getLang();
  const 쿠키 = document.cookie.split(";").map((s) => s.trim()).find((s) => s.startsWith(KEY + "="))?.slice(KEY.length + 1);
  if (쿠키 === 지금) return false;
  setLang(지금);
  return true;
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

  /* 앱 이름. 영어판에서는 짧은 이름을 쓴다 — 인스타 글에서도 같은 이름을 썼다. */
  app_name: { ko: "두근도트", en: "Dot" },

  /* 아래 탭 */
  tab_feed: { ko: "피드", en: "Feed" },
  tab_tarot: { ko: "타로", en: "Tarot" },
  tab_search: { ko: "검색", en: "Search" },
  tab_chats: { ko: "채팅", en: "Chats" },
  tab_me: { ko: "내 창", en: "Me" },
  tabs_aria: { ko: "아래 탭", en: "Bottom tabs" },
  loading: { ko: "불러오는 중", en: "Loading" },
  settings_aria: { ko: "설정", en: "Settings" },

  /* 피드 */
  feed_following: { ko: "팔로잉", en: "Following" },
  feed_all: { ko: "전체", en: "All" },
  feed_no_follow: { ko: "아직 팔로우한 캐릭터가 없어요. 팔로우하면 여기에 모여요.", en: "You are not following anyone yet. Whoever you follow shows up here." },
  feed_empty: { ko: "아직 올라온 게시물이 없어요. 캐릭터들이 곧 올릴 거예요.", en: "Nothing posted yet. They will put something up soon." },
  feed_like: { ko: "좋아요", en: "Like" },
  feed_chat: { ko: "채팅", en: "Chat" },

  /* 채팅 목록 */
  chats_empty: { ko: "아직 추가한 사람이 없어요.", en: "You have not added anyone yet." },
  chats_empty_go: { ko: "검색에서 찾아보기", en: "Find someone in Search" },
  chats_signin: { ko: "로그인하면 이야기를 이어서 할 수 있어요", en: "Sign in to keep your conversations" },
  chats_mine: { ko: "나: ", en: "You: " },

  /* 내 창 */
  me_posts: { ko: "게시물", en: "Posts" },
  me_followers: { ko: "팔로워", en: "Followers" },
  me_following: { ko: "팔로잉", en: "Following" },
  me_hearts: { ko: "받은 하트", en: "Hearts" },
  me_mutual: { ko: "맞팔해 준 캐릭터", en: "Following you back" },
  me_until_mutual: { ko: "맞팔까지", en: "Until they follow back" },
  me_empty: { ko: "아직 올린 게 없어요.", en: "You have not posted anything yet." },
  me_signup_title: { ko: "계정을 만들면 여기에 모여요", en: "Make an account and this fills up" },
  me_signup_1: { ko: "내가 올린 게시물", en: "The photos you post" },
  me_signup_2: { ko: "맞팔해 준 캐릭터와 받은 하트", en: "Who follows you back, and your hearts" },
  me_signup_3: { ko: "맞팔까지 얼마나 남았는지", en: "How close you are to a follow back" },
  me_google: { ko: "구글로 계정 만들기", en: "Create an account with Google" },
  me_opening: { ko: "여는 중…", en: "Opening…" },
  me_google_err: { ko: "구글 연결을 못 열었어요.", en: "Could not open the Google connection." },

  /* 검색 */
  search_placeholder: { ko: "이름이나 분위기로 찾기", en: "Search by name or mood" },
  search_aria: { ko: "캐릭터 검색", en: "Search characters" },
  search_clear: { ko: "지우기", en: "Clear" },
  search_none_sub: { ko: "이름 말고 “조용한”, “선배” 같은 말로도 찾아보세요.", en: "Try a mood instead of a name — “quiet”, “late shift”." },
  search_added: { ko: "추가됨", en: "Added" },
  search_add: { ko: "추가", en: "Add" },
  follow: { ko: "팔로우", en: "Follow" },
  following: { ko: "팔로잉", en: "Following" },

  /* 설정 */
  st_account: { ko: "계정", en: "Account" },
  st_app: { ko: "앱", en: "App" },
  st_info: { ko: "안내", en: "About" },
  st_device: { ko: "이 기기로 쓰는 중", en: "Using this device only" },
  st_device_sub: { ko: "대화와 친밀도가 이 기기에 저장돼요 · 폰을 바꾸면 안 따라와요", en: "Chats and closeness live on this device · they do not move to a new phone" },
  st_account_sub: { ko: "로그인한 계정 · 폰을 바꿔도 이 계정으로 이어져요", en: "Signed in · your chats follow this account to a new phone" },
  st_privacy: { ko: "개인정보 처리방침", en: "Privacy policy" },
  st_child: { ko: "아동 안전 기준", en: "Child safety standards" },
  st_contact: { ko: "문의·신고", en: "Contact & report" },
  st_menu_note: { ko: "알림·배경·멘헤라 모드는 각 대화방의 ≡ 메뉴에 있어요", en: "Notifications, background and Menhera Mode live in each room's ≡ menu" },
  st_signout: { ko: "로그아웃", en: "Sign out" },
  st_delete: { ko: "계정 삭제", en: "Delete account" },
  st_delete_sub: { ko: "되돌릴 수 없어요", en: "This cannot be undone" },

  /* 대화방 */
  room_device_note: { ko: "대화는 이 기기에 저장돼요 · 폰을 바꾸면 안 따라와요", en: "This chat is saved on this device · it does not move to a new phone" },
  room_input: { ko: "메시지 입력", en: "Type a message" },
  room_today: { ko: "오늘", en: "Today" },
  room_yesterday: { ko: "어제", en: "Yesterday" },
  time_now: { ko: "방금", en: "just now" },
  last_stage: { ko: "마지막 단계", en: "Final stage" },
} as const;

export type Key = keyof typeof 말;

export function t(key: Key, lang: Lang): string {
  return 말[key][lang];
}

/** 몇 장 모았는지 같은 문장. 언어마다 어순이 달라 따로 만든다. */
export function collectedLine(n: number, total: number, lang: Lang): string {
  return lang === "en" ? `${n} of ${total} collected` : `${total}장 중 ${n}장`;
}

/** "좋아요 N개" — 영어는 1개와 여러 개의 글자가 다르다. */
export function likesLine(n: number, lang: Lang): string {
  return lang === "en" ? `${n} like${n === 1 ? "" : "s"}` : `좋아요 ${n}개`;
}

/**
 * "N분 전" 같은 지난 시간. **언어마다 따로 만든다** — 한국어는 수를 세는 말이 붙고
 * 영어는 하나일 때 글자가 바뀐다. 한 벌로 쓰면 "1 minutes ago" 가 나온다.
 */
export function agoLine(ms: number, lang: Lang): string {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 1) return lang === "en" ? "just now" : "방금";
  if (m < 60) return lang === "en" ? `${m} minute${m === 1 ? "" : "s"} ago` : `${m}분 전`;
  const h = Math.round(m / 60);
  if (h < 24) return lang === "en" ? `${h} hour${h === 1 ? "" : "s"} ago` : `${h}시간 전`;
  const d = Math.round(h / 24);
  if (d === 1) return lang === "en" ? "yesterday" : "어제";
  return lang === "en" ? `${d} days ago` : `${d}일 전`;
}

/** 대화 목록의 시각. 한국어는 오전/오후, 영어는 am/pm 이고 날짜 차례도 다르다. */
export function whenLine(iso: string, lang: Lang): string {
  const k = new Date(new Date(iso).getTime() + 9 * 3_600_000);
  const now = new Date(Date.now() + 9 * 3_600_000);
  const y = new Date(now.getTime() - 86_400_000);
  const key = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
  if (key(k) === key(now)) {
    const h = k.getUTCHours();
    const mm = String(k.getUTCMinutes()).padStart(2, "0");
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return lang === "en" ? `${h12}:${mm} ${h < 12 ? "AM" : "PM"}` : `${h < 12 ? "오전" : "오후"} ${h12}:${mm}`;
  }
  if (key(k) === key(y)) return lang === "en" ? "Yesterday" : "어제";
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return lang === "en" ? `${MON[k.getUTCMonth()]} ${k.getUTCDate()}` : `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일`;
}
