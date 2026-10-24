/**
 * 전투 글줄을 `말()` 로 옮긴다 (10-24, 전세계화 2판).
 *
 * 왜 스크립트인가: 35군데를 손으로 고치면 한 군데는 꼭 어긋난다.
 * **짝이 정확히 한 번 나오는지 세고**, 하나라도 안 맞으면 **아무것도 안 쓴다.**
 */
import { readFileSync, writeFileSync } from "node:fs";

const 경로 = "C:/Users/az518/Desktop/ai-workforce/public/ash/index.html";
let s = readFileSync(경로, "utf8");

/** 새로 쓰는 말 — 한국어 틀은 **원래 글자 그대로** 옮겨 적는다(뜻이 바뀌면 안 된다) */
const 새말 = {
  "fight.barrierCrack": { ko: "{foe}의 보호막이 갈라졌다. (남은 {n}%)", en: "{foe}'s barrier splits. ({n}% left)" },
  "fight.hitArrow": { ko: "→ {foe} <span class=\"hit\">{dmg}</span>", en: "→ {foe} <span class=\"hit\">{dmg}</span>" },
  "fight.hitArrowCrit": { ko: "→ {foe} <span class=\"hit\">{dmg}</span> <span class='big'>치명타</span>", en: "→ {foe} <span class=\"hit\">{dmg}</span> <span class='big'>CRIT</span>" },
  "fight.allyBarrier": { ko: "아군 전원 막 <span class=\"good\">{n}</span>", en: "Barrier on all allies <span class=\"good\">{n}</span>" },
  "fight.execute": { ko: "<b>{name}</b>의 <span class=\"big\">처형</span> → {foe} <span class=\"hit\">{dmg}</span>", en: "<b>{name}</b>'s <span class=\"big\">Execute</span> → {foe} <span class=\"hit\">{dmg}</span>" },
  "fight.fireball": { ko: "<b>{name}</b>의 화염구 → {foe} <span class=\"hit\">{dmg}</span>", en: "<b>{name}</b>'s fireball → {foe} <span class=\"hit\">{dmg}</span>" },
  "fight.holyFire": { ko: "<b>{name}</b>의 성화 → {foe} <span class=\"hit\">{dmg}</span>", en: "<b>{name}</b>'s holy flame → {foe} <span class=\"hit\">{dmg}</span>" },
  "fight.holyBless": { ko: "<b>{name}</b>{이가} 성스러운 축복을 내렸다. <span class=\"good\">아군 전원 공격 +20% · 3턴</span>", en: "<b>{name}</b> grants a holy blessing. <span class=\"good\">All allies ATK +20% · 3 turns</span>" },
  "fight.lightWard": { ko: "<b>{name}</b>{이가} 빛의 수호막을 펼쳤다. <span class=\"good\">아군 전원 막</span>", en: "<b>{name}</b> spreads a ward of light. <span class=\"good\">Barrier on all allies</span>" },
  "fight.tempestCut": { ko: "<b>{name}</b>{이가} 관통 폭풍 참을 휘둘렀다.", en: "<b>{name}</b> swings a piercing tempest cut." },
  "fight.bloodBless": { ko: "<b>{name}</b>{이가} 혈의 축복을 내렸다. <span class=\"bad\">체력 10%</span> → <span class=\"good\">아군 전원 공격 +40% · 3턴</span>", en: "<b>{name}</b> grants a blessing of blood. <span class=\"bad\">10% HP</span> → <span class=\"good\">All allies ATK +40% · 3 turns</span>" },
  "fight.soulFlip": { ko: "<b>{name}</b>{이가} 영혼을 뒤집었다. {foe}의 보호막 <b>{n}</b>이 아군에게 넘어온다.", en: "<b>{name}</b> inverts the soul. {foe}'s barrier <b>{n}</b> passes to the allies." },
  "fight.allyTookBarrier": { ko: "아군 전원이 그 막을 둘렀다.", en: "Every ally takes up that barrier." },
  "fight.shieldBash": { ko: "<b>{name}</b>{이가} 방패로 들이받았다. → {foe} <span class=\"hit\">{dmg}</span>", en: "<b>{name}</b> rams with the shield. → {foe} <span class=\"hit\">{dmg}</span>" },
  "fight.atkDown": { ko: " <span class=\"good\">· 공격 −10% (2턴)</span>", en: " <span class=\"good\">· ATK −10% (2 turns)</span>" },
  "fight.sanctuary": { ko: "<b>{name}</b>{이가} 성역의 진형을 세웠다. <span class=\"good\">아군 전원 방어 +35% · 받는 피해 −15% · 3턴</span>", en: "<b>{name}</b> sets the formation of sanctuary. <span class=\"good\">All allies DEF +35% · damage taken −15% · 3 turns</span>" },
  "fight.vitalStrike": { ko: "<b>{name}</b>{이가} 급소를 베었다. → {foe} <span class=\"hit\">{dmg}</span>", en: "<b>{name}</b> cuts a vital spot. → {foe} <span class=\"hit\">{dmg}</span>" },
  "fight.shadowAmbush": { ko: "<b>{name}</b>{이가} 그림자에서 덮쳤다. → {foe} <span class=\"hit\">{dmg}</span> <span class=\"bad\">· 출혈 3턴</span>", en: "<b>{name}</b> strikes from the shadows. → {foe} <span class=\"hit\">{dmg}</span> <span class=\"bad\">· bleed 3 turns</span>" },
  "fight.decayCurse": { ko: "<b>{name}</b>{이가} 부패의 저주를 뿌렸다. <span class=\"bad\">적 전원 3턴 지속 피해 · 방어 15% 감소</span>", en: "<b>{name}</b> casts the curse of decay. <span class=\"bad\">All foes take damage for 3 turns · DEF −15%</span>" },
  "fight.chainsBreak": { ko: "<b>{name}</b>{이가} 사슬을 던져 보호막을 끊었다.", en: "<b>{name}</b> throws chains and severs the barrier." },
  "fight.bleedOpen": { ko: "{foe}의 상처가 벌어졌다. <span class=\"hit\">{dmg}</span>", en: "{foe}'s wound tears open. <span class=\"hit\">{dmg}</span>" },
  "fight.decayGnaw": { ko: "{foe}{이가} 부패에 갉아먹혔다. <span class=\"hit\">{dmg}</span>", en: "{foe} is gnawed by decay. <span class=\"hit\">{dmg}</span>" },
  "fight.bossSlam": { ko: "<b>{foe}</b>{이가} 바닥을 내리찍었다 — <span class=\"big\">전원</span>", en: "<b>{foe}</b> slams the ground — <span class=\"big\">everyone</span>" },
  "fight.hitAlly": { ko: "→ <b>{who}</b> <span class=\"bad\">{dmg}</span>", en: "→ <b>{who}</b> <span class=\"bad\">{dmg}</span>" },
  "fight.hitAllyBlocked": { ko: "→ <b>{who}</b> <span class=\"bad\">{dmg}</span> (막 {blocked})", en: "→ <b>{who}</b> <span class=\"bad\">{dmg}</span> (barrier {blocked})" },
  "fight.stoodBackUp": { ko: "<b>{who}</b>{이가} 쓰러지려다 <span class=\"good\">다시 섰다</span>. (체력 {n})", en: "<b>{who}</b> nearly falls but <span class=\"good\">stands again</span>. (HP {n})" },
  "fight.didNotKneel": { ko: "<b>{who}</b>{이가} 무릎을 꿇지 않았다 — 막 <span class=\"good\">{n}</span>", en: "<b>{who}</b> refuses to kneel — barrier <span class=\"good\">{n}</span>" },
  "fight.collapsed": { ko: "<b>{who}</b>{이가} 주저앉았다.", en: "<b>{who}</b> slumps down." },
  "fight.knightGuards": { ko: "<b>기사</b>가 {who} 앞에 방패를 들었다. 막 <span class=\"good\">{n}</span>", en: "The <b>Knight</b> raises a shield before {who}. Barrier <span class=\"good\">{n}</span>" },
  "fight.foeBlocked": { ko: "{foe} → <b>{who}</b> 막이 <span class=\"good\">{blocked}</span> 받아냈다", en: "{foe} → <b>{who}</b> the barrier absorbed <span class=\"good\">{blocked}</span>" },
  "fight.foeBlockedLeak": { ko: " · <span class=\"bad\">{dmg}</span>", en: " · <span class=\"bad\">{dmg}</span>" },
  "fight.barrierBroke": { ko: " — 막이 깨졌다", en: " — the barrier broke" },
  "fight.foeHit": { ko: "{foe} → <b>{who}</b> <span class=\"bad\">{dmg}</span>", en: "{foe} → <b>{who}</b> <span class=\"bad\">{dmg}</span>" },
  "fight.potionBroke": { ko: "별빛 회복약이 깨졌다. <b>{who}</b> <span class=\"good\">+{n}</span>", en: "A starlight potion shatters. <b>{who}</b> <span class=\"good\">+{n}</span>" },
  "fight.packArrives": { ko: "<b>{i}번째 무리</b>가 어둠에서 걸어 나왔다. ({i}/{n})", en: "<b>Pack {i}</b> walks out of the dark. ({i}/{n})" },
  "fight.levelUp": { ko: "<b>{name}</b> 레벨 {n}", en: "<b>{name}</b> level {n}" },
  /* 무기 낱말 — `fight.blocked` 의 {what} 으로 들어간다 */
  "v.검": { ko: "검", en: "sword" },
  "v.칼": { ko: "칼", en: "blade" },
  "v.단검": { ko: "단검", en: "dagger" },
  "v.방패": { ko: "방패", en: "shield" },
  "v.성화": { ko: "성화", en: "holy flame" },
};

/** 짝 — [옛 글자, 새 글자]. 옛 글자는 파일에 **정확히 한 번** 나와야 한다. */
const 짝 = [
  /* 새벽을 가르는 방패 */
  [`장면(null, null, \`\${e.이름}의 보호막이 갈라졌다. (남은 \${e.보호막}%)\`, "", { 종류:"맞음", 에:자리(e), 색:"#7aa8ff" });`,
   `장면(null, null, 말("fight.barrierCrack", { foe: 말값(e.이름), n: e.보호막 }), "", { 종류:"맞음", 에:자리(e), 색:"#7aa8ff" });`],
  [`      장면(null, null, \`→ \${e.이름} <span class="hit">\${수(피)}</span>\`, "", { 종류:"맞음", 에:자리(e), 색:"#bfe6ff" });`,
   `      장면(null, null, 말("fight.hitArrow", { foe: 말값(e.이름), dmg: 수(피) }), "", { 종류:"맞음", 에:자리(e), 색:"#bfe6ff" });`],
  [`    장면(null, null, \`아군 전원 막 <span class="good">\${수(양)}</span>\`, "good", 막주기(c, 산아군(), 양, "#bfe6ff"));`,
   `    장면(null, null, 말("fight.allyBarrier", { n: 수(양) }), "good", 막주기(c, 산아군(), 양, "#bfe6ff"));`],
  [`    장면(c, "attack", \`<b>\${c.이름}</b>의 <span class="big">처형</span> → \${e.이름} <span class="hit">\${수(피)}</span>\`, "big",`,
   `    장면(c, "attack", 말("fight.execute", { name: c.이름, foe: 말값(e.이름), dmg: 수(피) }), "big",`],
  [`    장면(c, "attack", \`<b>\${c.이름}</b>의 화염구 → \${e.이름} <span class="hit">\${수(피)}</span>\`, "",`,
   `    장면(c, "attack", 말("fight.fireball", { name: c.이름, foe: 말값(e.이름), dmg: 수(피) }), "",`],
  [`    장면(c, "attack", \`<b>\${c.이름}</b>의 성화 → \${e.이름} <span class="hit">\${수(피)}</span>\`, "",`,
   `    장면(c, "attack", 말("fight.holyFire", { name: c.이름, foe: 말값(e.이름), dmg: 수(피) }), "",`],
  [`    장면(c, "attack", \`<b>\${c.이름}</b>\${조사(c.이름,"이","가")} 성스러운 축복을 내렸다. <span class="good">아군 전원 공격 +20% · 3턴</span>\`, "big",`,
   `    장면(c, "attack", 말("fight.holyBless", { name: c.이름 }), "big",`],
  [`    장면(c, "attack", \`<b>\${c.이름}</b>\${조사(c.이름,"이","가")} 빛의 수호막을 펼쳤다. <span class="good">아군 전원 막</span>\`, "big", 빛);`,
   `    장면(c, "attack", 말("fight.lightWard", { name: c.이름 }), "big", 빛);`],
  [`    장면(c, "attack", \`<b>\${c.이름}</b>\${조사(c.이름,"이","가")} 관통 폭풍 참을 휘둘렀다.\`, "big",`,
   `    장면(c, "attack", 말("fight.tempestCut", { name: c.이름 }), "big",`],
  [`      if (깎) 벤것.push(\`\${t.이름} −\${수(깎)}\`);`,
   `      if (깎) 벤것.push(\`\${말값(t.이름)} −\${수(깎)}\`);`],
  [`    장면(c, "attack", \`<b>\${c.이름}</b>\${조사(c.이름,"이","가")} 혈의 축복을 내렸다. <span class="bad">체력 10%</span> → <span class="good">아군 전원 공격 +40% · 3턴</span>\``,
   `    장면(c, "attack", 말("fight.bloodBless", { name: c.이름 })`],
  [`    장면(c, "attack", \`<b>\${c.이름}</b>\${조사(c.이름,"이","가")} 영혼을 뒤집었다. \${e.이름}의 보호막 <b>\${뺏}</b>이 아군에게 넘어온다.\`, "big",`,
   `    장면(c, "attack", 말("fight.soulFlip", { name: c.이름, foe: 말값(e.이름), n: 뺏 }), "big",`],
  [`\`아군 전원이 그 막을 둘렀다.\``, `말("fight.allyTookBarrier")`],
  [`    장면(c, "attack", \`<b>\${c.이름}</b>\${조사(c.이름,"이","가")} 방패로 들이받았다. → \${e.이름} <span class="hit">\${수(피)}</span>\``,
   `    장면(c, "attack", 말("fight.shieldBash", { name: c.이름, foe: 말값(e.이름), dmg: 수(피) })`],
  [`\` <span class="good">· 공격 −10% (2턴)</span>\``, `말("fight.atkDown")`],
  [`    장면(c, "attack", \`<b>\${c.이름}</b>\${조사(c.이름,"이","가")} 성역의 진형을 세웠다. <span class="good">아군 전원 방어 +35% · 받는 피해 −15% · 3턴</span>\`, "big",`,
   `    장면(c, "attack", 말("fight.sanctuary", { name: c.이름 }), "big",`],
  [`    장면(c, "attack", \`<b>\${c.이름}</b>\${조사(c.이름,"이","가")} 급소를 베었다. → \${e.이름} <span class="hit">\${수(피)}</span>\``,
   `    장면(c, "attack", 말("fight.vitalStrike", { name: c.이름, foe: 말값(e.이름), dmg: 수(피) })`],
  [`    장면(c, "attack", \`<b>\${c.이름}</b>\${조사(c.이름,"이","가")} 그림자에서 덮쳤다. → \${e.이름} <span class="hit">\${수(피)}</span> <span class="bad">· 출혈 3턴</span>\`, "big",`,
   `    장면(c, "attack", 말("fight.shadowAmbush", { name: c.이름, foe: 말값(e.이름), dmg: 수(피) }), "big",`],
  [`    장면(c, "attack", \`<b>\${c.이름}</b>\${조사(c.이름,"이","가")} 부패의 저주를 뿌렸다. <span class="bad">적 전원 3턴 지속 피해 · 방어 15% 감소</span>\`, "big",`,
   `    장면(c, "attack", 말("fight.decayCurse", { name: c.이름 }), "big",`],
  [`    장면(c, "attack", \`<b>\${c.이름}</b>\${조사(c.이름,"이","가")} 사슬을 던져 보호막을 끊었다.\`, "big", { 종류:"사슬", 에서:자리(c), 에:자리(e), 색:"#c69bff" });`,
   `    장면(c, "attack", 말("fight.chainsBreak", { name: c.이름 }), "big", { 종류:"사슬", 에서:자리(c), 에:자리(e), 색:"#c69bff" });`],
  [`    장면(null, null, \`\${e.이름}의 상처가 벌어졌다. <span class="hit">\${수(피)}</span>\`, "",`,
   `    장면(null, null, 말("fight.bleedOpen", { foe: 말값(e.이름), dmg: 수(피) }), "",`],
  [`    장면(null, null, \`\${e.이름}\${조사(e.이름,"이","가")} 부패에 갉아먹혔다. <span class="hit">\${수(피)}</span>\`, "",`,
   `    장면(null, null, 말("fight.decayGnaw", { foe: 말값(e.이름), dmg: 수(피) }), "",`],
  /* 보스 광역 */
  [`      장면(e, "attack", \`<b>\${e.이름}</b>\${조사(e.이름,"이","가")} 바닥을 내리찍었다 — <span class="big">전원</span>\`, "bad",`,
   `      장면(e, "attack", 말("fight.bossSlam", { foe: 말값(e.이름) }), "bad",`],
  [`        장면(null, null, \`→ <b>\${t.이름}</b> <span class="bad">\${수(피2)}</span>\${막2 > 0 ? \` (막 \${수(막2)})\` : ""}\`, "",`,
   `        장면(null, null, 막2 > 0 ? 말("fight.hitAllyBlocked", { who: t.이름, dmg: 수(피2), blocked: 수(막2) }) : 말("fight.hitAlly", { who: t.이름, dmg: 수(피2) }), "",`],
  [`        if (재2) 장면(null, null, \`<b>\${t.이름}</b>\${조사(t.이름,"이","가")} 쓰러지려다 <span class="good">다시 섰다</span>. (체력 \${수(재2)})\`, "good",`,
   `        if (재2) 장면(null, null, 말("fight.stoodBackUp", { who: t.이름, n: 수(재2) }), "good",`],
  [`        if (불2) 장면(null, null, \`<b>\${t.이름}</b>\${조사(t.이름,"이","가")} 무릎을 꿇지 않았다 — 막 <span class="good">\${수(불2)}</span>\`, "good",`,
   `        if (불2) 장면(null, null, 말("fight.didNotKneel", { who: t.이름, n: 수(불2) }), "good",`],
  /* 보통 적 공격 */
  [`  if (수호) 장면(세리안(), "attack", \`<b>기사</b>가 \${t.이름} 앞에 방패를 들었다. 막 <span class="good">\${수(수호)}</span>\`, "",`,
   `  if (수호) 장면(세리안(), "attack", 말("fight.knightGuards", { who: t.이름, n: 수(수호) }), "",`],
  [`    ? \`\${e.이름} → <b>\${t.이름}</b> 막이 <span class="good">\${수(막음)}</span> 받아냈다\${피 > 0 ? \` · <span class="bad">\${수(피)}</span>\` : ""}\${t.막 <= 0 ? " — 막이 깨졌다" : ""}\`
    : \`\${e.이름} → <b>\${t.이름}</b> <span class="bad">\${수(피)}</span>\`;`,
   `    ? 말("fight.foeBlocked", { foe: 말값(e.이름), who: t.이름, blocked: 수(막음) })
      + (피 > 0 ? 말("fight.foeBlockedLeak", { dmg: 수(피) }) : "") + (t.막 <= 0 ? 말("fight.barrierBroke") : "")
    : 말("fight.foeHit", { foe: 말값(e.이름), who: t.이름, dmg: 수(피) });`],
  [`  if (재기) 장면(null, null, \`<b>\${t.이름}</b>\${조사(t.이름,"이","가")} 쓰러지려다 <span class="good">다시 섰다</span>. (체력 \${수(재기)})\`, "good",`,
   `  if (재기) 장면(null, null, 말("fight.stoodBackUp", { who: t.이름, n: 수(재기) }), "good",`],
  [`  if (불굴) 장면(null, null, \`<b>\${t.이름}</b>\${조사(t.이름,"이","가")} 무릎을 꿇지 않았다 — 막 <span class="good">\${수(불굴)}</span>\`, "good",`,
   `  if (불굴) 장면(null, null, 말("fight.didNotKneel", { who: t.이름, n: 수(불굴) }), "good",`],
  [`    장면(null, null, \`별빛 회복약이 깨졌다. <b>\${t.이름}</b> <span class="good">+\${수(양)}</span>\`, "good", { 종류:"회복", 에:자리(t), 색:"#ffe9a0" });`,
   `    장면(null, null, 말("fight.potionBroke", { who: t.이름, n: 수(양) }), "good", { 종류:"회복", 에:자리(t), 색:"#ffe9a0" });`],
  /* 무리 · 레벨 */
  [`\`<b>\${무리 + 1}번째 무리</b>가 어둠에서 걸어 나왔다. (\${무리 + 1}/\${S.무리수})\``,
   `말("fight.packArrives", { i: 무리 + 1, n: S.무리수 })`],
  [`      if (S.파티.includes(c.id)) 장면(c, "idle", \`<b>\${c.이름}</b> 레벨 \${c.레벨}\`, "good");`,
   `      if (S.파티.includes(c.id)) 장면(c, "idle", 말("fight.levelUp", { name: c.이름, n: c.레벨 }), "good");`],
  /* 무기 낱말을 표로 보낸다 */
  [`튕겼나(c, e, "검", "#7aa8ff")`, `튕겼나(c, e, 말값("검"), "#7aa8ff")`],
  [`튕겼나(c, e, "방패", "#ff9a5c")`, `튕겼나(c, e, 말값("방패"), "#ff9a5c")`],
  [`튕겼나(c, e, "성화", "#ffe9a0")`, `튕겼나(c, e, 말값("성화"), "#ffe9a0")`],
  [`튕겼나(c, e, "화염구", "#c69bff")`, `튕겼나(c, e, 말값("화염구"), "#c69bff")`],
];

/* ── 1. 짝이 전부 **딱 한 번** 나오나 ── */
const 탈 = [];
for (const [옛, ] of 짝) {
  const n = s.split(옛).length - 1;
  if (n !== 1) 탈.push({ 번: 짝.findIndex((p) => p[0] === 옛), 횟수: n, 앞: 옛.slice(0, 70) });
}
/**
 * **똑같은 틀이 두 번 이상 나오는 자리** — 바꿀 글도 똑같으니 한꺼번에 바꾼다.
 * (연속베기·관통폭풍참의 치명타 줄, 두 자리의 "주저앉았다", 무기 낱말 둘)
 * 들여쓰기는 **일부러 뺐다** — 같은 줄이 깊이만 다르게 두 번 나오기 때문이다.
 */
const 여러번 = [
  [`장면(null, null, \`→ \${e.이름} <span class="hit">\${수(피)}</span>\${치명 ? " <span class='big'>치명타</span>" : ""}\`, "",`,
   `장면(null, null, 말(치명 ? "fight.hitArrowCrit" : "fight.hitArrow", { foe: 말값(e.이름), dmg: 수(피) }), "",`],
  [`if (t.hp <= 0) 장면(null, null, \`<b>\${t.이름}</b>\${조사(t.이름,"이","가")} 주저앉았다.\`, "bad");`,
   `if (t.hp <= 0) 장면(null, null, 말("fight.collapsed", { who: t.이름 }), "bad");`],
  [`튕겼나(c, e, "칼", "#7aa8ff")`, `튕겼나(c, e, 말값("칼"), "#7aa8ff")`],
  [`튕겼나(c, e, "단검", "#c0c8d4")`, `튕겼나(c, e, 말값("단검"), "#c0c8d4")`],
];
/* 전부 바꾸는 쪽도 **적어도 한 번은** 나와야 한다 — 0번이면 내가 틀린 글자를 적은 것이다 */
for (const [옛] of 여러번) {
  const n = s.split(옛).length - 1;
  if (n === 0) 탈.push({ 번: -1, 횟수: 0, 앞: "(여러번) " + 옛.slice(0, 60) });
}
if (탈.length) {
  console.log("**안 쓴다** — 짝이 안 맞았다:");
  탈.forEach((t) => console.log("  " + t.횟수 + "번  " + t.앞));
  process.exit(1);
}

/* ── 2. 바꾼다 ── */
for (const [옛, 새] of 짝) s = s.replace(옛, 새);
for (const [옛, 새] of 여러번) s = s.split(옛).join(새);

/* ── 3. 말표에 새 말을 넣는다 ── */
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
const 이미 = new Set([...s.slice(0, i).matchAll(/"((?:fight|v)\.[^"]+)"/g)].map((m) => m[1]));
const 넣을것 = Object.entries(새말).filter(([k]) => !이미.has(k));
const 줄 = ["", "  /* ── 전투 글줄 (10-24 전세계화 2판) ── */"];
for (const [k, v] of 넣을것) 줄.push("  " + JSON.stringify(k) + ": { ko: " + JSON.stringify(v.ko) + ", en: " + JSON.stringify(v.en) + " },");
s = s.slice(0, i) + 줄.join("\n") + "\n" + s.slice(i);

writeFileSync(경로, s, "utf8");
console.log("전투 글줄 " + 짝.length + "군데 바꿨다 · 말표에 " + 넣을것.length + "줄 넣었다");
