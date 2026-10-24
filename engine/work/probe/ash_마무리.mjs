/**
 * 전세계화 마지막 묶음 (10-24, 5판) — 자가 짚은 77자를 없앤다.
 *   길드 "기사" · 캐릭터 카드의 직업·등급·역할 · 가방/탭/닫기 라벨
 *
 * **탭 이름은 키로 쓰인다**(`S.가방탭 === "재료"`). 그래서 라벨만 바꾸고 키는 한국어로 둔다 —
 * 보이는 글과 비교하는 값을 같이 바꾸면 탭이 안 먹는다.
 */
import { readFileSync, writeFileSync } from "node:fs";

const 경로 = "C:/Users/az518/Desktop/ai-workforce/public/ash/index.html";
let s = readFileSync(경로, "utf8");

const 새말 = {
  "ui.bag": { ko: "가방", en: "Bag" },
  "ui.close": { ko: "닫기", en: "Close" },
  "ui.gold": { ko: "금화", en: "Gold" },
  "ui.stardust": { ko: "별가루", en: "Stardust" },
  "ui.bagHead": { ko: "{gold} {g} · {dust} {d}", en: "{gold} {g} · {dust} {d}" },
  "ui.consumHint": { ko: "소모품은 <b>떠나기 전</b>에 몇 개 챙길지 고른다 — 탑에서 층을 고를 때.", en: "You pick how many consumables to carry <b>before you set out</b> — when choosing a floor on the tower." },
  "ui.supplies": { ko: "소모품", en: "Consumables" },
  "ui.growth": { ko: "자람", en: "Growth" },
  "ui.levelNow": { ko: "지금 레벨", en: "Level now" },
  "ui.levelCap": { ko: "올릴 수 있는 끝", en: "Level cap" },
  "ui.toNext": { ko: "다음 레벨까지", en: "To next level" },
  "ui.onField": { ko: "출전 중", en: "On field" },
  /* 가방·대원 서브탭 — 보이는 글만 옮긴다(키는 그대로) */
  "v.재료": { ko: "재료", en: "Materials" },
  "v.장비": { ko: "장비", en: "Gear" },
  "v.영혼석": { ko: "영혼석", en: "Soulstones" },
  "v.소모품": { ko: "소모품", en: "Consumables" },
  "v.강화": { ko: "강화", en: "Upgrade" },
  "v.기술": { ko: "기술", en: "Skills" },
  "v.장신구": { ko: "장신구", en: "Trinket" },
};

const 짝 = [
  /* 캐릭터 카드 머리 — 직업·등급·역할 */
  [`      <div class="nm"><b class="큰이름"><span style="color:\${등급색[d.등급]}">\${d.직업}</span>`,
   `      <div class="nm"><b class="큰이름"><span style="color:\${등급색[d.등급]}">\${말값(d.직업)}</span>`],
  [`        <span class="tag" style="color:\${등급색[d.등급]}">\${d.등급}</span></b>
        <i>\${d.역할}\${안에 ? " · 출전 중" : ""}\${S.대표 === c.id ? " · 대표" : ""}</i>`,
   `        <span class="tag" style="color:\${등급색[d.등급]}">\${말값(d.등급)}</span></b>
        <i>\${말값(d.역할)}\${안에 ? " · " + 말("ui.onField") : ""}\${S.대표 === c.id ? " · " + 말("ui.leader") : ""}</i>`],
  /* 파티 고르기 창 */
  [`                 <b>\${d.직업} Lv.\${c.레벨}</b><i class="참">출전 중</i>\``,
   `                 <b>\${말값(d.직업)} Lv.\${c.레벨}</b><i class="참">\${말("ui.onField")}</i>\``],
  [`          <b>\${d.직업}</b><i>\${안 ? "출전" : \`Lv.\${c.레벨}\`}</i></div>\`; }).join("")`,
   `          <b>\${말값(d.직업)}</b><i>\${안 ? 말("ui.fielded") : \`Lv.\${c.레벨}\`}</i></div>\`; }).join("")`],
  /* 뽑기 결과 카드 */
  [`        <div class="nm"><b><span style="color:\${등급색[d.등급]}">\${d.직업}</span>`,
   `        <div class="nm"><b><span style="color:\${등급색[d.등급]}">\${말값(d.직업)}</span>`],
  [`          <span class="tag" style="color:\${등급색[d.등급]}">\${d.등급}</span>\${안에 ?`,
   `          <span class="tag" style="color:\${등급색[d.등급]}">\${말값(d.등급)}</span>\${안에 ?`],
  /* 가방 창 머리 */
  [`      <div class="nm"><b style="display:block;font-size:15px">가방</b>
        <i style="color:var(--흐림);font-size:12px">금화 \${수(S.금화)} · 별가루 \${수(g.별가루 ?? 0)}</i></div>`,
   `      <div class="nm"><b style="display:block;font-size:15px">\${말("ui.bag")}</b>
        <i style="color:var(--흐림);font-size:12px">\${말("ui.bagHead", { gold: 말("ui.gold"), g: 수(S.금화), dust: 말("ui.stardust"), d: 수(g.별가루 ?? 0) })}</i></div>`],
  [`          \${아이콘("i-약")}<div class="이름">별빛 회복약</div><div class="수">\${수(g.약 ?? 0)}</div></div></div>
        <div class="풀이 on">소모품은 <b>떠나기 전</b>에 몇 개 챙길지 고른다 — 탑에서 층을 고를 때.</div>\`;`,
   `          \${아이콘("i-약")}<div class="이름">\${말값("별빛 회복약")}</div><div class="수">\${수(g.약 ?? 0)}</div></div></div>
        <div class="풀이 on">\${말("ui.consumHint")}</div>\`;`],
  [`          <div class="준비머리">\${아이콘("s-scroll")} 소모품</div>`,
   `          <div class="준비머리">\${아이콘("s-scroll")} \${말("ui.supplies")}</div>`],
  /* 강화 칸 */
  [`          <div class="칸이름">자람</div>`, `          <div class="칸이름">\${말("ui.growth")}</div>`],
  [`            <div class="조건줄 참"><span>지금 레벨</span><b>Lv.\${c.레벨}</b></div>`,
   `            <div class="조건줄 참"><span>\${말("ui.levelNow")}</span><b>Lv.\${c.레벨}</b></div>`],
  [`            <div class="조건줄\${c.레벨 >= 레벨상한(c) ? "" : " 참"}"><span>올릴 수 있는 끝</span><b>Lv.\${레벨상한(c)}</b></div>`,
   `            <div class="조건줄\${c.레벨 >= 레벨상한(c) ? "" : " 참"}"><span>\${말("ui.levelCap")}</span><b>Lv.\${레벨상한(c)}</b></div>`],
  [`            <div class="조건줄"><span>다음 레벨까지</span><b>\${수(Math.max(0, 필요경험(c) - c.경험))}</b></div>`,
   `            <div class="조건줄"><span>\${말("ui.toNext")}</span><b>\${수(Math.max(0, 필요경험(c) - c.경험))}</b></div>`],
];

/** 여러 번 나오는 라벨 — 보이는 글만 바꾼다 */
const 여러번 = [
  [`<button class="btn" id="닫기">닫기</button>`, `<button class="btn" id="닫기">\${말("ui.close")}</button>`],
  [`data-대원탭="\${t}"><img src="art/icon/\${ic}.png" alt="">\${t}</span>`,
   `data-대원탭="\${t}"><img src="art/icon/\${ic}.png" alt="">\${말값(t)}</span>`],
  [`data-가방탭="\${t}"><img src="art/icon/\${ic}.png" alt="">\${t}</span>`,
   `data-가방탭="\${t}"><img src="art/icon/\${ic}.png" alt="">\${말값(t)}</span>`],
  [`\${["무기", "갑옷", "장신구"].map(슬롯칸).join("")}`, `\${["무기", "갑옷", "장신구"].map(슬롯칸).join("")}`],
];

const 탈 = [];
for (const [옛] of 짝) { const n = s.split(옛).length - 1; if (n !== 1) 탈.push(n + "번  " + 옛.trim().slice(0, 72)); }
for (const [옛] of 여러번) { const n = s.split(옛).length - 1; if (n === 0) 탈.push("0번(여러번)  " + 옛.slice(0, 72)); }
if (탈.length) { console.log("**안 쓴다** — 짝이 안 맞았다:"); 탈.forEach((t) => console.log("  " + t)); process.exit(1); }

for (const [옛, 새] of 짝) s = s.replace(옛, 새);
for (const [옛, 새] of 여러번) if (옛 !== 새) s = s.split(옛).join(새);

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
const 줄 = ["", "  /* ── 전세계화 5판 (10-24) ── */"];
for (const [k, v] of 넣을것) 줄.push("  " + JSON.stringify(k) + ": { ko: " + JSON.stringify(v.ko) + ", en: " + JSON.stringify(v.en) + " },");
s = s.slice(0, i) + 줄.join("\n") + "\n" + s.slice(i);

writeFileSync(경로, s, "utf8");
console.log("마무리 " + (짝.length + 여러번.length) + "군데 · 말표에 " + 넣을것.length + "줄");
