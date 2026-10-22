/**
 * 잿빛 전투 글을 말 표로 옮기는 한 판 (10-22). 모델 0 · 값 0.
 *   node engine/work/probe/ash_전투글_옮기기.mjs
 *
 * 전투 글은 문장 안에 `조사(이름,"이","가")` 가 박혀 있어 손으로 고치면 틀리기 쉽다.
 * **정확히 일치하는 글자만** 바꾼다 — 하나라도 못 찾으면 **아무것도 안 쓰고 멈춘다**
 * (반쯤 바뀐 파일이 제일 나쁘다).
 */
import { readFileSync, writeFileSync } from "node:fs";

const 파일 = "public/ash/index.html";
let s = readFileSync(파일, "utf8");

const 짝 = [
  // 보스 등장
  ['`<b>${S.층}층</b> — ${b.이름}${조사(b.이름,"이","가")} 길을 막고 있다.`',
   '말("fight.boss", { n: S.층, name: b.이름 })'],
  // 적이 쓰러짐 — 제일 자주 보인다
  ['`${e.이름}${조사(e.이름,"이","가")} 쓰러졌다.`',
   '말("fight.down", { name: e.이름 })'],
  // 기사 기본
  ['`<b>${c.이름}</b>${조사(c.이름,"이","가")} 검과 방패를 함께 내질렀다. → ${e.이름} <span class="hit">${수(피)}</span>`',
   '말("fight.knightHit", { name: c.이름, foe: e.이름, dmg: 수(피) })'],
  // 검사 기본
  ['`<b>${c.이름}</b>${조사(c.이름,"이","가")} 두 번 베었다.`',
   '말("fight.twoCuts", { name: c.이름 })'],
  // 검사 노리기
  ['`<b>${c.이름}</b>${조사(c.이름,"이","가")} 숨을 죽이고 틈을 노린다. <span class="good">다음 공격 치명타 · 방어 40% 무시</span>`',
   '말("fight.aim", { name: c.이름 })'],
  // 회복
  ['`<b>${c.이름}</b>${조사(c.이름,"이","가")} ${t.이름}의 상처를 덮었다. <span class="good">+${수(양)}</span>`',
   '말("fight.heal", { name: c.이름, who: t.이름, n: 수(양) })'],
];

const 못찾음 = 짝.filter(([a]) => !s.includes(a));
if (못찾음.length) {
  console.error(`못 찾은 것 ${못찾음.length}개 — **아무것도 안 바꿨다.**`);
  for (const [a] of 못찾음) console.error("  " + a.slice(0, 80));
  process.exit(1);
}
for (const [a, b] of 짝) s = s.replace(a, b);
writeFileSync(파일, s, "utf8");
console.log(`바꾼 곳 ${짝.length}개`);
