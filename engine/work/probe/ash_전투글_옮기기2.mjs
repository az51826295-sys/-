/**
 * 잿빛 전투 글 둘째 판 (10-23) — 첫 열 층에서 보이는 나머지. 모델 0 · 값 0.
 *   node engine/work/probe/ash_전투글_옮기기2.mjs
 *
 * 첫 판과 같은 규칙: **정확히 일치하는 글자만** 바꾸고, 하나라도 못 찾으면
 * **아무것도 안 쓰고 멈춘다**(반쯤 바뀐 파일이 제일 나쁘다).
 */
import { readFileSync, writeFileSync } from "node:fs";

const 파일 = "public/ash/index.html";
let s = readFileSync(파일, "utf8");

const 짝 = [
  ['`<b>${c.이름}</b>의 ${글}${조사(글,"이","가")} 보호막에 튕겼다.`',
   '말("fight.blocked", { name: c.이름, what: 글 })'],
  ['`<b>${c.이름}</b>${조사(c.이름,"이","가")} 철벽의 맹세를 세웠다. 아군 전원 막 <span class="good">${수(양)}</span> · 적의 눈이 방패로 쏠린다.`',
   '말("fight.vow", { name: c.이름, n: 수(양) })'],
  ['`<b>${c.이름}</b>${조사(c.이름,"이","가")} 새벽을 가르는 방패를 펼쳤다.`',
   '말("fight.dawnShield", { name: c.이름 })'],
  ['`<b>${c.이름}</b>${조사(c.이름,"은","는")} 숨을 고르며 뒤를 살폈다.`',
   '말("fight.catchBreath", { name: c.이름 })'],
  ['`<b>${c.이름}</b>${조사(c.이름,"이","가")} 구원의 진형을 펼쳤다. 아군 전원 <span class="good">+${수(양)}</span>`',
   '말("fight.salvation", { name: c.이름, n: 수(양) })'],
  ['`<b>${c.이름}</b>${조사(c.이름,"이","가")} 조용히 기도했다. ${t.이름} <span class="good">+${수(양)}</span>`',
   '말("fight.pray", { name: c.이름, who: t.이름, n: 수(양) })'],
  ['`<b>${c.이름}</b>${조사(c.이름,"은","는")} 향로를 흔들었다.`',
   '말("fight.censer", { name: c.이름 })'],
];

const 못찾음 = 짝.filter(([a]) => !s.includes(a));
if (못찾음.length) {
  console.error(`못 찾은 것 ${못찾음.length}개 — **아무것도 안 바꿨다.**`);
  for (const [a] of 못찾음) console.error("  " + a.slice(0, 90));
  process.exit(1);
}
for (const [a, b] of 짝) s = s.replace(a, b);
writeFileSync(파일, s, "utf8");
console.log(`바꾼 곳 ${짝.length}개`);
