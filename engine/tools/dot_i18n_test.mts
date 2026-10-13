/**
 * 두근도트 다국어 시험 (10-13). 모델·DB 없음.
 * 언어 고르기, 캐릭터·게시물 덮어쓰기(칸이 없거나 비면 한국어 그대로), 캐릭터에게 주는 언어 지시.
 */
import { pickLocale, makeT, guessLocale } from "../../src/lib/i18n/core";
import { localizeCharacter, nameIn, captionIn } from "../../src/lib/dot/i18n";
import { languageRule } from "../../src/lib/dot/turn";
import { applyTurn } from "../../src/lib/dot/bond";
import { DOT } from "../../src/lib/i18n/dict/dot";
import { localClock, minuteKST, openerLanguageRule, timeOfDayAt } from "../../src/lib/dot/push";

let fail = 0;
const ok = (name: string, cond: boolean, got?: unknown) => { console.log(`${cond ? "✅" : "❌"} ${name}${cond ? "" : "  ← " + JSON.stringify(got)}`); if (!cond) fail++; };

// 언어 고르기: 쿠키 → Accept-Language(q 순) → 영어
ok("쿠키가 이긴다", pickLocale("ja-JP,ja;q=0.9", "ko") === "ko");
ok("폰이 일본어면 일본어", pickLocale("ja-JP,ja;q=0.9,en;q=0.8", null) === "ja");
ok("폰이 한국어면 한국어", pickLocale("ko-KR,ko;q=0.9", undefined) === "ko");
ok("q 가 높은 쪽", pickLocale("en;q=0.5,ja;q=0.9", null) === "ja");
ok("모르는 언어(스페인어)면 영어", pickLocale("es-ES,es;q=0.9", null) === "en");
ok("이상한 쿠키는 무시", pickLocale("ko", "fr") === "ko");
ok("아무것도 없으면 영어", pickLocale(null, null) === "en");

// 글로 언어 짐작(요청 없이 나중에 붙는 로키 말)
ok("가나 → 일본어", guessLocale("ゲームを作って") === "ja" && guessLocale("これ、OK?") === "ja");
ok("한글 → 한국어", guessLocale("게임 만들어 줘") === "ko" && guessLocale("make it 빨갛게") === "ko");
ok("로마자 → 영어", guessLocale("make a game please") === "en");
ok("빈 글·숫자·한자만 → 한국어(예전 그대로)", guessLocale("") === "ko" && guessLocale("123 !!") === "ko" && guessLocale("漢字") === "ko");

// 캐릭터 덮어쓰기
const yuna = { name: "유나", tagline: "카페 알바생", greeting: "안녕!", chips: ["뭐 해?"], photos: [{ url: "a.png", caption: "카페" }, { url: "b.png", caption: "바다" }],
  i18n: { en: { name: "Yuna", tagline: "Café part-timer", greeting: "Hi!", chips: ["What are you up to?"], photos: ["Café", ""] }, ja: { name: "ユナ" } } };
const en = localizeCharacter(yuna, "en");
ok("영어: 이름·소개·인사·고를 말", en.name === "Yuna" && en.tagline === "Café part-timer" && en.greeting === "Hi!" && en.chips![0] === "What are you up to?", en);
ok("영어: 사진 설명은 있는 것만, 빈 것은 한국어", en.photos![0].caption === "Café" && en.photos![1].caption === "바다", en.photos);
const ja = localizeCharacter(yuna, "ja");
ok("일본어: 이름만 있으면 이름만, 나머지는 한국어", ja.name === "ユナ" && ja.tagline === "카페 알바생" && ja.greeting === "안녕!", ja);
ok("한국어는 그대로(같은 객체)", localizeCharacter(yuna, "ko") === yuna);
ok("원래 객체는 안 바뀐다(캐시 보호)", yuna.name === "유나" && yuna.photos[0].caption === "카페");
ok("i18n 칸이 없는 DB(마이그레이션 전)", localizeCharacter({ name: "유나", tagline: "x" }, "en").name === "유나");
ok("i18n 이 이상한 값이어도", localizeCharacter({ name: "유나", i18n: "oops" }, "en").name === "유나" && nameIn({ name: "유나", i18n: null }, "ja") === "유나");
ok("nameIn", nameIn(yuna, "en") === "Yuna" && nameIn(yuna, "ko") === "유나");
ok("captionIn: 있으면 번역, 없으면 원문", captionIn({ caption: "바다 왔다", i18n: { en: "At the beach" } }, "en") === "At the beach" && captionIn({ caption: "바다 왔다", i18n: { en: "At the beach" } }, "ja") === "바다 왔다");

// 캐릭터에게 주는 언어 지시
ok("한국어 사용자에겐 아무것도 안 붙는다(프롬프트·캐시 그대로)", languageRule("ko", "유나", "유나") === "");
const le = languageRule("en", "유나", "Yuna"), lj = languageRule("ja", "유나", "ユナ");
ok("영어 지시: 영어로만·이름·웃음·기억", le.includes("영어로만") && le.includes("\"Yuna\"") && le.includes("lol") && le.includes("Name: OO"), le);
ok("일본어 지시: 일본어로만·です・ます/タメ口·이름", lj.includes("일본어로만") && lj.includes("タメ口") && lj.includes("\"ユナ\"") && lj.includes("名前はOO"), lj);
ok("번역 이름이 없으면 소리 나는 대로", languageRule("en", "유나", "유나").includes("소리 나는 대로"));

// 친밀도 이유(토스트)
const b = { points: 0, stage: 1, streakDays: 0, lastTalkedOn: null };
const g = applyTurn(b, "2026-10-13", "this is a pretty long message", { name: "소금빵", points: 8, liked: true }, makeT(DOT, "en"));
ok("영어 토스트", g.reasons.includes("First chat today +5") && g.reasons.includes("Gift: Salt bread (a favorite!) +8") && g.reasons.includes("Long message +1"), g.reasons);
const k = applyTurn(b, "2026-10-13", "안녕", null);
ok("기본은 예전 한국어 그대로", k.reasons.includes("오늘 첫 대화 +5"), k.reasons);
ok("일본어 토스트", applyTurn(b, "2026-10-13", "やあ", null, makeT(DOT, "ja")).reasons.includes("今日はじめての会話 +5"));

// 먼저 말 걸기: 그 사람 시간대
const at = new Date("2026-10-13T03:30:00Z");   // 한국 12:30 화요일, 뉴욕 전날(월) 23:30
ok("시간대 없으면 한국 시간", localClock(null, at).minute === minuteKST(at), localClock(null, at));
ok("도쿄 = 한국과 같은 시각", localClock("Asia/Tokyo", at).minute === 12 * 60 + 30, localClock("Asia/Tokyo", at));
ok("뉴욕은 23:30, 월요일", localClock("America/New_York", at).minute === 23 * 60 + 30 && localClock("America/New_York", at).dow === 1, localClock("America/New_York", at));
ok("이상한 시간대는 한국 시간", localClock("Mars/Base", at).minute === minuteKST(at));
ok("모델에게 주는 지금: 뉴욕 밤", timeOfDayAt("America/New_York", at).includes("월요일 밤"), timeOfDayAt("America/New_York", at));
ok("모델에게 주는 지금: 시간대 없으면 한국 시간 문구", timeOfDayAt(null, at).startsWith("한국 시간"), timeOfDayAt(null, at));
ok("먼저 말: 한국어면 지시 없음, 영어·일본어면 그 언어", openerLanguageRule("ko", "유나") === "" && openerLanguageRule("en", "Yuna").includes("영어로만") && openerLanguageRule("ja", "ユナ").includes("タメ口"));

console.log(fail ? `\n${fail}개 실패` : "\n모두 통과"); process.exit(fail ? 1 : 0);
