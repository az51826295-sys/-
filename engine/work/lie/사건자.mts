/**
 * **사건 표가 성한가** (228회차 10-01). 모델 0 · 값 0.
 *   npx tsx engine/work/lie/사건자.mts
 *   npx tsx engine/work/lie/사건자.mts --sabotage   ← 고장을 심어 자가 깨어 있나 본다
 *
 * 사건을 더할 때 틀리기 쉬운 자리를 센다 — 없는 증거를 가리키는 약점, 없는 사람을 가리키는 교차,
 * 잠긴 지점의 할 말 없음, 그리고 제일 무서운 것: **조사로 못 얻는 증거를 지목 조건에 넣어 사건이 영영 안 닫히는 것.**
 */
const { 사건들, 사건검사 } = await import("../../../src/lib/lie/case");
const 심기 = process.argv.includes("--sabotage");

let 틀림 = 0;
for (const c of 사건들) {
  const 흠 = 사건검사(c);
  if (흠.length) { 틀림 += 흠.length; console.log(`어긋남 ${c.id} — ${c.제목}`); for (const h of 흠) console.log(`        · ${h}`); }
  else console.log(`맞음   ${c.id} — ${c.제목}\n        증거 ${c.증거.length} · 용의자 ${c.용의자.length} · 교차 ${c.교차.length} · 조사 지점 ${c.현장.지점.length}`);
}
console.log(틀림 ? `\n**어긋남 ${틀림}개**` : `\n**사건 ${사건들.length}개 전부 성함**`);

if (심기) {
  // 네 가지를 따로 심는다 — 한 번에 심으면 하나만 잡아도 통과로 보인다.
  const 심을것: { 이름: string; 심기: (c: any) => () => void }[] = [
    { 이름: "약점이 없는 증거를 가리킴", 심기: (c) => { const w = c.용의자[0].약점[0]; const 앞 = w.증거id; w.증거id = "없는증거"; return () => { w.증거id = 앞; }; } },
    { 이름: "조사 지점이 없는 곳에 있음", 심기: (c) => { const p = c.현장.지점[0]; const 앞 = p.곳; p.곳 = "없는곳"; return () => { p.곳 = 앞; }; } },
    { 이름: "잠긴 지점에 할 말이 없음", 심기: (c) => { const p = c.현장.지점.find((x: any) => x.필요한증거); const 앞 = p.잠긴말; delete p.잠긴말; return () => { p.잠긴말 = 앞; }; } },
    // 심은 것이 **제대로 된 고장**이어야 한다: 있는 증거이고 지목 조건에도 들었는데 아무 지점도 안 준다.
    // (없는 id 를 넣으면 "없는 증거" 자가 먼저 잡아서, 닫힘 자가 깨어 있는지는 못 재게 된다 — 10-01 처음 심었을 때 그랬다.)
    { 이름: "사건이 안 닫힘(지목에 필요한 증거를 아무 지점도 안 줌)", 심기: (c) => {
        const 필요 = c.지목에필요한증거[0];
        const 주던곳 = c.현장.지점.filter((p: any) => p.얻는증거 === 필요);
        const 앞 = 주던곳.map((p: any) => p.얻는증거);
        for (const p of 주던곳) delete p.얻는증거;
        return () => { 주던곳.forEach((p: any, i: number) => { p.얻는증거 = 앞[i]; }); };
      } },
  ];
  let 잡음 = 0;
  console.log("\n── 심은 고장 ──");
  for (const s of 심을것) {
    const 되돌리기 = s.심기(사건들[0]);
    const 흠 = 사건검사(사건들[0]);
    되돌리기();
    if (흠.length) { 잡음++; console.log(`잡음     ${s.이름}\n         → ${흠[0]}`); }
    else console.log(`**놓침** ${s.이름}`);
  }
  console.log(`\n심은 고장 ${잡음}/${심을것.length} 잡음`);
  if (잡음 < 심을것.length) process.exitCode = 1;
}
