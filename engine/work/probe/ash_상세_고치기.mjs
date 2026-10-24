/**
 * 캐릭터 상세 화면 29자 (10-24, 6판) — 자가 곁탭을 열고서야 보인 자리다.
 *
 * 이 자리가 그대로 남아 있던 까닭: 자가 `[data-풀이]` 를 바로 눌러 **아무것도 안 열린 화면**을
 * 한국어 0 으로 세고 있었다. 자를 고치니 29자가 한 번에 나왔다 — **못 본 것은 0 이 아니다.**
 */
import { readFileSync, writeFileSync } from "node:fs";

const 경로 = "C:/Users/az518/Desktop/ai-workforce/public/ash/index.html";
let s = readFileSync(경로, "utf8");

const 새말 = {
  "ui.power": { ko: "전투력", en: "Power" },
  "ui.oneLine": { ko: "체력 <b>{hp}</b> · 공격 <b>{atk}</b> · 방어 <b>{def}</b> · 속도 <b>{spd}</b>", en: "HP <b>{hp}</b> · ATK <b>{atk}</b> · DEF <b>{def}</b> · SPD <b>{spd}</b>" },
  "ui.tapToSee": { ko: "눌러 보기", en: "tap to read" },
  "ui.skills": { ko: "기술", en: "Skills" },
  "ui.traits": { ko: "특성", en: "Traits" },
  "ui.isLeader": { ko: "대표임", en: "Is leader" },
  "ui.makeLeader": { ko: "대표로", en: "Make leader" },
  "ui.dupeCards": { ko: "겹친 카드", en: "Duplicate cards" },
  "ui.growNote": { ko: "레벨은 <b>싸워서</b> 오른다. 그리고 <b>지금까지 연 층</b>까지만 오른다 —\n            지금은 <b>Lv.{cap}</b> 이 끝이고, 층을 열면 그만큼 더 오른다.<br>\n            되돌이로 레벨을 밀어 올리는 길을 일부러 막아 뒀다. 그게 막혀 있어야 <b>장비를 만들 이유</b>가 생긴다.\n            <br><br>경험치 주입·승급은 <b>아직 없다</b> — 넣으면 이 설계가 깨지므로 사장님 결정을 기다린다.", en: "Levels come from <b>fighting</b>, and only up to <b>the floors you have opened</b> —\n            right now <b>Lv.{cap}</b> is the ceiling, and opening floors raises it.<br>\n            Grinding levels up is blocked on purpose. That block is what gives you <b>a reason to forge gear</b>.\n            <br><br>XP injection and promotion are <b>not in yet</b> — adding them would break this design, so it waits on the owner's call." },
  /* 장비 슬롯 이름 */
  "v.장신구2": { ko: "장신구", en: "Trinket" },
};

const 짝 = [
  [`        <div class="힘">전투력 <b>\${수(전투력(c))}</b></div>`,
   `        <div class="힘">\${말("ui.power")} <b>\${수(전투력(c))}</b></div>`],
  [`    <div class="한줄자">체력 <b>\${수(최대체력(c))}</b> · 공격 <b>\${수(공격력(c))}</b>
      · 방어 <b>\${수(방어력(c))}</b> · 속도 <b>\${속도(c)}</b></div>`,
   `    <div class="한줄자">\${말("ui.oneLine", { hp: 수(최대체력(c)), atk: 수(공격력(c)), def: 수(방어력(c)), spd: 속도(c) })}</div>`],
  [`            <div class="조건줄"><span>겹친 카드</span><b>\${c.중복}</b></div>`,
   `            <div class="조건줄"><span>\${말("ui.dupeCards")}</span><b>\${c.중복}</b></div>`],
  [`          <div class="풀이 on">레벨은 <b>싸워서</b> 오른다. 그리고 <b>지금까지 연 층</b>까지만 오른다 —
            지금은 <b>Lv.\${레벨상한(c)}</b> 이 끝이고, 층을 열면 그만큼 더 오른다.<br>
            되돌이로 레벨을 밀어 올리는 길을 일부러 막아 뒀다. 그게 막혀 있어야 <b>장비를 만들 이유</b>가 생긴다.
            <br><br>경험치 주입·승급은 <b>아직 없다</b> — 넣으면 이 설계가 깨지므로 사장님 결정을 기다린다.</div>`,
   `          <div class="풀이 on">\${말("ui.growNote", { cap: 레벨상한(c) })}</div>`],
  [`      : \`<div style="padding:4px 11px 0"><div class="칸이름">기술 <span class="귀띔">눌러 보기</span></div>`,
   `      : \`<div style="padding:4px 11px 0"><div class="칸이름">\${말("ui.skills")} <span class="귀띔">\${말("ui.tapToSee")}</span></div>`],
  [`         \${d.특성?.length ? \`<div class="칸이름">특성 <span class="귀띔">눌러 보기</span></div>`,
   `         \${d.특성?.length ? \`<div class="칸이름">\${말("ui.traits")} <span class="귀띔">\${말("ui.tapToSee")}</span></div>`],
  [`      <button class="btn" id="대표로" style="flex:1">\${S.대표 === c.id ? "대표임" : "대표로"}</button>`,
   `      <button class="btn" id="대표로" style="flex:1">\${말(S.대표 === c.id ? "ui.isLeader" : "ui.makeLeader")}</button>`],
  /* 장비 슬롯 이름 · 효과 칸 이름 */
  [`      <div class="칸이름2">\${슬롯}</div>`, `      <div class="칸이름2">\${말값(슬롯)}</div>`],
  [`    const 값 = 낀 ? Object.entries(레시피[낀.키].효과 ?? {}).map(([k, v]) => \`\${k} +\${v}\`).join(" · ") : "";`,
   `    const 값 = 낀 ? Object.entries(레시피[낀.키].효과 ?? {}).map(([k, v]) => \`\${말값(k)} +\${v}\`).join(" · ") : "";`],
];

const 탈 = [];
for (const [옛] of 짝) { const n = s.split(옛).length - 1; if (n !== 1) 탈.push(n + "번  " + 옛.trim().slice(0, 70)); }
if (탈.length) { console.log("**안 쓴다**:"); 탈.forEach((t) => console.log("  " + t)); process.exit(1); }
for (const [옛, 새] of 짝) s = s.replace(옛, 새);

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
const 표본문 = s.slice(0, i);
const 넣을것 = Object.entries(새말).filter(([k]) => !표본문.includes(JSON.stringify(k) + ": {"));
const 줄 = ["", "  /* ── 캐릭터 상세 (10-24 전세계화 6판) ── */"];
for (const [k, v] of 넣을것) 줄.push("  " + JSON.stringify(k) + ": { ko: " + JSON.stringify(v.ko) + ", en: " + JSON.stringify(v.en) + " },");
s = s.slice(0, i) + 줄.join("\n") + "\n" + s.slice(i);

writeFileSync(경로, s, "utf8");
console.log("상세 " + 짝.length + "군데 · 말표에 " + 넣을것.length + "줄");
