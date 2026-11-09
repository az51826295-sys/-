/**
 * # 놀이 규칙 자 — **심은 고장으로 잡는지부터**  (11-09)
 *
 *   npx tsx engine/tools/dot_games_test.mts
 *
 * 모델을 안 부른다. 코드가 세는 것만 센다: 끝말잇기 첫 글자·중복·두음법칙, 초성 뽑기,
 * 맞춤 판정, 스무고개 끝 조건, 씨앗이 정말 정해져 있나.
 */
const g = await import("../../src/lib/dot/games");

type 줄 = [boolean, string];
const 적은것: 줄[] = [];
const 보기 = (맞나: boolean, 말: string) => 적은것.push([맞나, 말]);

/* ── 끝말잇기 ── */
const 쓴것 = ["사과", "과자"];
보기(g.checkWordChain("과자", "자두", 쓴것).ok, "자두 — 받는다");
보기(!g.checkWordChain("과자", "두부", 쓴것).ok, "두부 — 첫 글자가 틀려 막는다");
보기(!g.checkWordChain("과자", "사과", 쓴것).ok, "사과 — 이미 나와서 막는다");
보기(!g.checkWordChain("과자", "자", 쓴것).ok, "한 글자 — 막는다");
보기(!g.checkWordChain("과자", "ja", 쓴것).ok, "영어 — 막는다");
보기(!g.checkWordChain("과자", "", 쓴것).ok, "빈 말 — 막는다");
/* 두음법칙: 량 → 양·냥 을 받아 준다. 안 받으면 사람이 "왜 안 돼?" 하고 떠난다. */
보기(g.checkWordChain("분량", "양말", []).ok, "분량 → 양말 — 두음법칙을 받는다");
보기(g.checkWordChain("분량", "량심", []).ok, "분량 → 량심 — 그대로도 받는다");
보기(!g.checkWordChain("분량", "사과", []).ok, "분량 → 사과 — 막는다");

/* ── 초성 ── */
보기(g.toChoseong("학교") === "ㅎㄱ", `학교 → ${g.toChoseong("학교")}`);
보기(g.toChoseong("아이스크림") === "ㅇㅇㅅㅋㄹ", `아이스크림 → ${g.toChoseong("아이스크림")}`);
보기(g.QUIZ_WORDS.every((w) => g.isHangul(w) && w.length >= 2), "퀴즈 낱말이 전부 한글 두 글자 이상");

/* ── 맞춤 판정 ── */
보기(g.answerMatches("고양이", "혹시 고양이?"), "문장부호가 붙어도 맞다");
보기(g.answerMatches("고양이", "고 양 이"), "띄어 써도 맞다");
보기(!g.answerMatches("고양이", "강아지"), "다른 말은 안 맞다");

/* ── 스무고개 ── */
보기(g.guessState("우산", ["이건 먹는 거야?", "비 올 때 써?"]).끝났나 === false, "두 번 물었으면 안 끝난다");
보기(g.guessState("우산", ["혹시 우산?"]).맞힘, "맞히면 끝난다");
보기(g.guessState("우산", Array(20).fill("음")).끝났나, "스무 번을 다 쓰면 끝난다");

/* ── 씨앗 ── */
const s1 = g.gameSeed("u", "c", "2026-11-09", "스무고개", 1);
const s2 = g.gameSeed("u", "c", "2026-11-09", "스무고개", 1);
const s3 = g.gameSeed("u", "c", "2026-11-09", "스무고개", 2);
보기(s1 === s2, "같은 판이면 같은 씨앗 — 다시 세도 답이 안 바뀐다");
보기(s1 !== s3, "다음 판이면 다른 씨앗");
보기(g.pickLieIndex(s1) >= 0 && g.pickLieIndex(s1) <= 2, "거짓 자리는 0~2");
/* 씨앗이 골고루 흩어지나 — 한 낱말만 계속 나오면 둘째 판에 질린다 */
const 뽑힌것 = new Set(Array.from({ length: 200 }, (_, i) => g.pickQuizWord(g.gameSeed("u", "c", "2026-11-09", "초성퀴즈", i))));
보기(뽑힌것.size >= g.QUIZ_WORDS.length * 0.6, `200판에 서로 다른 낱말 ${뽑힌것.size}/${g.QUIZ_WORDS.length}`);

/* ── 말머리 ── */
보기(g.parseGameHead(g.gameHead("두진실한거짓", 3))?.game === "두진실한거짓", "말머리를 되읽는다");
보기(g.parseGameHead(g.gameHead("두진실한거짓", 3))?.회차 === 3, "회차도 되읽는다");
보기(g.parseGameHead("그냥 한 말") === null, "보통 말은 놀이가 아니다");

for (const [맞나, 말] of 적은것) console.log(`${맞나 ? "✅" : "❌"} ${말}`);
const 틀린수 = 적은것.filter(([m]) => !m).length;
console.log(`\n${적은것.length - 틀린수}/${적은것.length} 맞음`);
process.exit(틀린수 ? 1 : 0);
