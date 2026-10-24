/**
 * 기술·특성 **설명글** 29개를 `말()` 로 옮긴다 (10-24, 전세계화 3판).
 *
 * 숫자는 손대지 않는다 — 겹친 카드로 바뀌는 값은 그대로 `{}` 로 넘긴다.
 * 설명이 코드와 어긋나면 사장님이 그걸 믿고 편성을 짠다(원래 주석에 적힌 까닭).
 */
import { readFileSync, writeFileSync } from "node:fs";

const 경로 = "C:/Users/az518/Desktop/ai-workforce/public/ash/index.html";
let s = readFileSync(경로, "utf8");

/** 선언 하나를 통째로 바꾼다 */
function 블록바꾸기(머리글, 새본문) {
  const m = s.match(new RegExp("^const " + 머리글 + " = \\{", "m"));
  if (!m) throw new Error(머리글 + " 선언을 못 찾았다");
  let i = m.index + m[0].length - 1, depth = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'" || c === "`") { const q = c; i++; while (i < s.length && s[i] !== q) { if (s[i] === "\\") i++; i++; } }
    else if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) break; }
    i++;
  }
  s = s.slice(0, m.index) + 새본문 + s.slice(i + 1);
}

const 기술설명_새 = `const 기술설명 = {
  푸른방패검: (c) => 말("desc.푸른방패검"),
  철벽의맹세: (c) => 말("desc.철벽의맹세", { turns: c.중복 >= 5 ? 2 : 3, pct: c.중복 >= 1 ? 155 : 140 }),
  새벽을가르는방패: (c) => 말("desc.새벽을가르는방패", { pct: c.중복 >= 3 ? 220 : 180 })
    + (c.중복 >= 6 ? 말("desc.새벽을가르는방패.6") : ""),
  연속베기: (c) => 말("desc.연속베기"),
  약점노리기: (c) => 말("desc.약점노리기"),
  처형: (c) => 말("desc.처형"),
  "치유의빛": (c) => 말("desc.치유의빛"),
  "구원의진형": (c) => 말("desc.구원의진형"),
  "화염구": (c) => 말("desc.화염구"),
  "부패의저주": (c) => 말("desc.부패의저주"),
  사슬: (c) => 말("desc.사슬"),
  방패치기: (c) => 말("desc.방패치기"),
  성역의진형: (c) => 말("desc.성역의진형"),
  급소베기: (c) => 말("desc.급소베기"),
  관통폭풍참: (c) => 말("desc.관통폭풍참"),
  혈의축복: (c) => 말("desc.혈의축복"),
  영혼반전: (c) => 말("desc.영혼반전"),
  그림자습격: (c) => 말("desc.그림자습격"),
  "기도": (c) => 말("desc.기도"),
  "성스러운축복": (c) => 말("desc.성스러운축복"),
  "빛의수호막": (c) => 말("desc.빛의수호막"),
}`;

const 특성설명_새 = `const 특성설명 = {
  "마지막 수호자": (c) => 말("desc.마지막 수호자", { pct: c.중복 >= 2 ? 12 : 8 }),
  "푸른 강철의 결의": (c) => 말("desc.푸른 강철의 결의", { pct: c.중복 >= 4 ? 24 : 18 }),
  "결의": (c) => 말("desc.결의"),
  "꺼지지 않는 등불": (c) => 말("desc.꺼지지 않는 등불"),
  "손이 닿는 자리": (c) => 말("desc.손이 닿는 자리"),
  "불굴의 의지": (c) => 말("desc.불굴의 의지"),
  "맹독 바르기": (c) => 말("desc.맹독 바르기"),
  "마른 심지": (c) => 말("desc.마른 심지"),
}`;

/** 말표에 넣을 설명글. 한국어는 **원래 글자 그대로** 옮겨 적는다. */
const 새말 = {
  "desc.푸른방패검": {
    ko: `일반공격 · 적 하나를 공격력 <b>95%</b>로 친다. 그 뒤 나에게 막을 두른다 — 최대체력 4% + 공격력 35%.`,
    en: `Basic · Hits one foe for <b>95%</b> ATK, then wraps a barrier on self — 4% max HP + 35% ATK.` },
  "desc.철벽의맹세": {
    ko: `기술 · <b>{turns}턴</b>마다. 아군 전원에게 막 <b>공격력 {pct}%</b>를 씌우고, 적의 눈이 나에게 쏠린다(도발).`,
    en: `Skill · Every <b>{turns} turns</b>. Barriers all allies for <b>{pct}% ATK</b> and pulls every foe's eye onto me (taunt).` },
  "desc.새벽을가르는방패": {
    ko: `궁극기 · 적 전원을 <b>공격력 {pct}%</b>로 친다. 보호막을 두른 적은 피해 대신 <b>보호막 25</b>가 깎인다. 그 뒤 아군 전원에게 막 공격력 220%.`,
    en: `Ultimate · Hits all foes for <b>{pct}% ATK</b>. A barriered foe loses <b>25 barrier</b> instead of taking damage. Then barriers all allies for 220% ATK.` },
  "desc.새벽을가르는방패.6": { ko: ` 이 막은 <b>닳지 않는다</b>.`, en: ` That barrier <b>does not wear down</b>.` },
  "desc.연속베기": {
    ko: `일반공격 · 적 하나를 <b>두 번</b> 벤다(각 공격력 62%). 한 대마다 <b>12%</b>로 치명타(2배). 몰아 때리는 것보다 <b>막을 긁어내기</b> 좋다.`,
    en: `Basic · Cuts one foe <b>twice</b> (62% ATK each). Each hit crits at <b>12%</b> (2x). Better at <b>scraping barriers off</b> than one heavy blow.` },
  "desc.약점노리기": {
    ko: `기술 · <b>3턴</b>마다. 다음 공격이 <b>반드시 치명타</b>가 되고 적 <b>방어 40%를 무시</b>한다.`,
    en: `Skill · Every <b>3 turns</b>. The next attack is a <b>guaranteed crit</b> and <b>ignores 40% DEF</b>.` },
  "desc.처형": {
    ko: `기술 · <b>4턴</b>마다. 적의 남은 체력이 <b>절반 아래</b>일 때만 쓴다. 적이 다칠수록 세진다 — 반피에 <b>2.1배</b>, 10% 남으면 <b>3.2배</b>.`,
    en: `Skill · Every <b>4 turns</b>. Used only when the foe is <b>below half HP</b>. The more hurt they are, the harder it lands — <b>2.1x</b> at half, <b>3.2x</b> at 10% left.` },
  "desc.치유의빛": {
    ko: `일반공격 · 가장 많이 다친 아군을 <b>공격력 90%</b>만큼 회복한다.`,
    en: `Basic · Heals the most wounded ally for <b>90% ATK</b>.` },
  "desc.구원의진형": {
    ko: `기술 · <b>3턴</b>마다. 아군 <b>전원</b>을 공격력 50%만큼 회복한다. 보스가 3턴마다 전원을 치는 것에 맞서는 자리다.`,
    en: `Skill · Every <b>3 turns</b>. Heals <b>all</b> allies for 50% ATK. This is the answer to a boss sweeping the party every third turn.` },
  "desc.화염구": {
    ko: `일반공격 · 적 하나를 <b>공격력 125%</b>로 친다. 마법이라 적 <b>방어 20%를 무시</b>한다.`,
    en: `Basic · Hits one foe for <b>125% ATK</b>. Being magic, it <b>ignores 20% DEF</b>.` },
  "desc.부패의저주": {
    ko: `기술 · <b>4턴</b>마다. 적 <b>전원</b>에게 3턴 동안 매 턴 공격력 35%의 피해를 주고, 그동안 <b>방어를 15% 깎는다</b>.`,
    en: `Skill · Every <b>4 turns</b>. Deals 35% ATK to <b>all</b> foes each turn for 3 turns and <b>shaves 15% DEF</b> while it lasts.` },
  "desc.사슬": {
    ko: `기술 · <b>3턴</b>마다. 보호막을 두른 적 하나의 보호막을 <b>통째로</b> 없앤다.`,
    en: `Skill · Every <b>3 turns</b>. Strips one barriered foe's barrier <b>entirely</b>.` },
  "desc.방패치기": {
    ko: `일반공격 · 적 하나를 공격력 <b>100%</b>로 들이받는다. <b>20%</b>로 그 적의 공격력이 <b>10% 떨어진다</b>(2턴).`,
    en: `Basic · Rams one foe for <b>100%</b> ATK. <b>20%</b> chance to drop that foe's ATK by <b>10%</b> (2 turns).` },
  "desc.성역의진형": {
    ko: `기술 · <b>4턴</b>마다. <b>3턴</b> 동안 아군 전원 방어 <b>+35%</b>, 받는 피해 <b>−15%</b>. 둘은 따로 먹는다.`,
    en: `Skill · Every <b>4 turns</b>. For <b>3 turns</b>, all allies gain <b>+35%</b> DEF and take <b>−15%</b> damage. The two stack separately.` },
  "desc.급소베기": {
    ko: `일반공격 · 적 하나를 공격력 <b>100%</b>로 베고 그 적의 <b>방어 20%를 무시</b>한다. <b>12%</b>로 치명타(2배) — 출혈 중인 적에겐 <b>27%</b>.`,
    en: `Basic · Cuts one foe for <b>100%</b> ATK and <b>ignores 20% DEF</b>. Crits at <b>12%</b> (2x) — <b>27%</b> against a bleeding foe.` },
  "desc.관통폭풍참": {
    ko: `일반공격 · <b>적 전원</b>을 공격력 <b>78%</b>로 베고 <b>방어 20%를 무시</b>한다. <i>(폭풍의 영혼석)</i>`,
    en: `Basic · Cuts <b>all foes</b> for <b>78%</b> ATK and <b>ignores 20% DEF</b>. <i>(Soulstone of the Tempest)</i>` },
  "desc.혈의축복": {
    ko: `기술 · <b>4턴</b>마다. 아군 전원 체력을 <b>10%</b> 태우고 <b>3턴</b> 동안 공격 <b>+40%</b>. 이걸로는 쓰러지지 않는다. <i>(혈의 영혼석)</i>`,
    en: `Skill · Every <b>4 turns</b>. Burns <b>10%</b> of every ally's HP for <b>+40%</b> ATK over <b>3 turns</b>. It cannot drop anyone. <i>(Soulstone of Blood)</i>` },
  "desc.영혼반전": {
    ko: `기술 · <b>3턴</b>마다. 적 하나의 보호막을 통째로 끊고, <b>그만큼을 아군 전원의 막</b>으로 돌린다. <i>(역천의 영혼석)</i>`,
    en: `Skill · Every <b>3 turns</b>. Severs one foe's whole barrier and turns <b>that much into a barrier for every ally</b>. <i>(Soulstone of Defiance)</i>` },
  "desc.그림자습격": {
    ko: `기술 · <b>4턴</b>마다. 적 하나를 공격력 <b>160%</b>·방어 20% 무시로 치고 <b>3턴 출혈</b>을 남긴다(턴마다 공격력 40%). 출혈은 칼리드의 저주와 <b>따로</b> 쌓인다.`,
    en: `Skill · Every <b>4 turns</b>. Hits one foe for <b>160%</b> ATK ignoring 20% DEF and leaves <b>3 turns of bleed</b> (40% ATK per turn). Bleed stacks <b>separately</b> from Kalid's curse.` },
  "desc.기도": {
    ko: `일반공격 · 다친 아군이 있으면 <b>공격력 55%</b>만큼 덮고, 아무도 안 다쳤으면 적을 공격력 80%로 친다.`,
    en: `Basic · Mends a wounded ally for <b>55% ATK</b>; if nobody is hurt, hits a foe for 80% ATK instead.` },
  "desc.성스러운축복": {
    ko: `기술 · <b>4턴</b>마다. 아군 <b>전원</b>의 공격을 <b>3턴 동안 +20%</b>. 내 공격이 약한 대신 넷을 함께 키운다.`,
    en: `Skill · Every <b>4 turns</b>. Raises <b>every</b> ally's ATK by <b>+20% for 3 turns</b>. My own blows are weak; I lift all four instead.` },
  "desc.빛의수호막": {
    ko: `기술 · <b>3턴</b>마다. 아군 전원에게 <b>각자 최대체력의 14%</b>만큼 막. 공격력이 아니라 <b>받는 쪽의 몸집</b>을 따르므로 탱커가 더 두꺼워진다.`,
    en: `Skill · Every <b>3 turns</b>. Barriers every ally for <b>14% of their own max HP</b>. It follows <b>the receiver's size</b>, not my ATK, so the tank gets the thickest shell.` },
  /* ── 특성 ── */
  "desc.마지막 수호자": {
    ko: `가장 위태로운 아군이 맞기 직전, 내가 대신 막을 씌운다 — <b>내 최대체력의 {pct}%</b>. 한 턴에 한 번, 나 자신에게는 안 걸린다. 궁 게이지도 <b>+34</b> 찬다.`,
    en: `Just before the most endangered ally is struck, I throw a barrier over them instead — <b>{pct}% of my max HP</b>. Once per turn, never on myself. It also charges <b>+34</b> ultimate.` },
  "desc.푸른 강철의 결의": {
    ko: `내가 막을 두르고 있는 동안 <b>받는 피해 {pct}% 감소</b>.`,
    en: `While I hold a barrier, <b>damage taken is reduced {pct}%</b>.` },
  "desc.결의": {
    ko: `체력이 떨어질수록 공격이 오른다 — 체력이 다 닳기 직전이면 <b>+45%</b>. 벼랑에서 더 세진다.`,
    en: `The lower my HP, the harder I hit — <b>+45%</b> on the brink. Stronger at the cliff edge.` },
  "desc.꺼지지 않는 등불": {
    ko: `전투가 이어지는 동안 쉬지 않고 가장 위태로운 아군을 찾는다. 기술 「구원의 진형」은 <b>누군가 20% 넘게 다쳤을 때만</b> 쓴다 — 아껴 두었다가 광역이 들어온 뒤에 편다.`,
    en: `Through the whole fight I keep looking for whoever is closest to falling. I spend Formation of Salvation <b>only once someone is over 20% hurt</b> — held back for after a sweep lands.` },
  "desc.손이 닿는 자리": {
    ko: `뒤에 서서 넷을 본다. 축복과 막은 <b>살아 있는 아군 전원</b>에게 간다 — 누가 앞에 섰든.`,
    en: `I stand at the back and watch all four. Blessings and barriers reach <b>every living ally</b> — whoever is up front.` },
  "desc.불굴의 의지": {
    ko: `체력이 <b>30% 아래로 떨어지는 그 순간</b>, 한 판에 딱 한 번 <b>최대체력의 25%</b>만큼 막을 두른다. 막 천장(35%)은 그대로 먹는다.`,
    en: `<b>The moment HP falls under 30%</b>, once per battle, I wrap a barrier of <b>25% max HP</b>. The barrier cap (35%) still applies.` },
  "desc.맹독 바르기": {
    ko: `<b>출혈 중인 적</b>을 칠 때 치명타 확률이 <b>+15%</b>(12% → 27%). 그래서 「그림자 습격」을 먼저 넣고 베는 것이 세다.`,
    en: `Against a <b>bleeding foe</b>, crit chance is <b>+15%</b> (12% → 27%). So landing Shadow Ambush first and then cutting is the stronger line.` },
  "desc.마른 심지": {
    ko: `불과 저주를 함께 쓴다. 「부패의 저주」가 깎아 둔 방어는 <b>내 화염구뿐 아니라 아군의 모든 공격</b>에 함께 먹는다.`,
    en: `I wield fire and curse together. The DEF that Curse of Decay shaves off applies to <b>every ally's attack, not just my fireball</b>.` },
};

블록바꾸기("기술설명", 기술설명_새);
블록바꾸기("특성설명", 특성설명_새);

/* 말표에 넣는다 */
const 머리 = s.match(/^const 말표 = \{/m);
let i = 머리.index + 머리[0].length - 1, depth = 0;
while (i < s.length) {
  const c = s[i];
  if (c === '"' || c === "'" || c === "`") { const q = c; i++; while (i < s.length && s[i] !== q) { if (s[i] === "\\") i++; i++; } }
  else if (c === "/" && s[i + 1] === "/") { while (i < s.length && s[i] !== "\n") i++; }
  else if (c === "/" && s[i + 1] === "*") { i += 2; while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++; i++; }
  else if (c === "{") depth++;
  else if (c === "}") { depth--; if (depth === 0) break; }
  i++;
}
const 이미 = new Set([...s.slice(0, i).matchAll(/"(desc\.[^"]+)"/g)].map((m) => m[1]));
const 넣을것 = Object.entries(새말).filter(([k]) => !이미.has(k));
const 줄 = ["", "  /* ── 기술·특성 설명글 (10-24 전세계화 3판) ── */"];
for (const [k, v] of 넣을것) 줄.push("  " + JSON.stringify(k) + ": { ko: " + JSON.stringify(v.ko) + ", en: " + JSON.stringify(v.en) + " },");
s = s.slice(0, i) + 줄.join("\n") + "\n" + s.slice(i);

writeFileSync(경로, s, "utf8");
console.log("설명글 블록 2개를 바꿨다 · 말표에 " + 넣을것.length + "줄 넣었다");
