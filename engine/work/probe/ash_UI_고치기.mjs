/**
 * 남은 UI 글과 **이름을 찍는 자리**를 옮긴다 (10-24, 전세계화 4판).
 *
 * 이름은 자료에 한국어로 박혀 있으니 `말값()` 을 거쳐야 영어가 된다.
 * 10-24 에 `말값()` 은 표만 있고 **부르는 자리가 2곳뿐**이었다 — 그래서 뼈대가 헛돌았다.
 */
import { readFileSync, writeFileSync } from "node:fs";

const 경로 = "C:/Users/az518/Desktop/ai-workforce/public/ash/index.html";
let s = readFileSync(경로, "utf8");

const 새말 = {
  "log.barrierUp": { ko: "보호막이 돌고 있다. <b>제어</b>라면 한 번에 벗긴다.", en: "A barrier is running. A <b>Control</b> unit strips it in one go." },
  "log.partyRose": { ko: "원정대가 다시 섰다.", en: "The company is back on its feet." },
  "log.partyEmpty": { ko: "원정대가 비었다. 캐릭터 탭에서 태워라.", en: "The company is empty. Field someone from the Roster tab." },
  "log.stitching": { ko: "상처를 꿰매는 중… ({n})", en: "Stitching wounds… ({n})" },
  "log.turn": { ko: "턴 {n}", en: "Turn {n}" },
  "log.buffGone": { ko: "식당에서 받은 기운이 다했다.", en: "The strength from the canteen has run out." },
  "log.qualified": { ko: "<b>{n}층</b>으로 오를 <span class=\"big\">자격</span>을 얻었다.", en: "You have earned the <span class=\"big\">right</span> to climb to <b>floor {n}</b>." },
  "log.qualProgress": { ko: "{n}층 자격 — {rows}", en: "Floor {n} requirements — {rows}" },
  "log.darkMageJoins": { ko: "골렘의 잔해 속에서 <b>흑마법사</b>(제어)가 걸어 나왔다.", en: "Out of the golem's wreckage walks a <b>Dark Mage</b> (Control)." },
  "log.gateFell": { ko: "<b>{n}층</b> 관문에서 무너졌다. 자동 등반을 끄고 <b>{m}층</b>으로 물러나 힘을 모은다.", en: "You fell at the <b>floor {n}</b> gate. Auto-climb is off; falling back to <b>floor {m}</b> to gather strength." },
  "log.forgeUp": { ko: "대장간에서 장비를 갖추고 다시 오면 된다.", en: "Kit out at the forge and come back." },
  "log.retryFloor": { ko: "원정대가 쓰러졌다. 숨을 고르고 <b>{n}층</b>에 다시 든다.", en: "The company fell. Catch your breath and re-enter <b>floor {n}</b>." },
  "log.pushedBack": { ko: "원정대가 물러났다. 구간 처음으로 돌아간다.", en: "The company retreats. Back to the start of the stretch." },
  "log.autoOn": { ko: "자격이 차면 바로 올라간다.", en: "You will climb the moment you qualify." },
  "log.autoOff": { ko: "자격이 차도 이 층에 머문다.", en: "You will stay on this floor even once you qualify." },
  "log.mealServed": { ko: "식당에서 한 끼를 차렸다. <b>다음 10판 공격 +5%</b>", en: "A meal is served. <b>+5% ATK for the next 10 rounds</b>" },
  "log.lookUp": { ko: "발을 멈추고 탑을 올려다본다.", en: "You stop and look up at the tower." },
  /* 보상 줄 */
  "loot.base": { ko: "금화 <b>+{g}</b> · {shard} +{a} · {remnant} +{b}", en: "Gold <b>+{g}</b> · {shard} +{a} · {remnant} +{b}" },
  "loot.more": { ko: " · {what} +{n}", en: " · {what} +{n}" },
  "loot.firstStar": { ko: " · <span class=\"big\">별가루 +{n}</span> (첫 클리어)", en: " · <span class=\"big\">Stardust +{n}</span> (first clear)" },
  "loot.crest": { ko: " · 수호의 문장 +3", en: " · Crest of Guarding +3" },
  "loot.star": { ko: " · <b>별가루 +{n}</b>", en: " · <b>Stardust +{n}</b>" },
  "loot.starRadiant": { ko: " <i>(찬란한 별가루)</i>", en: " <i>(Radiant Stardust)</i>" },
  "loot.soulstone": { ko: " · <span class=\"big\">{what}</span>", en: " · <span class=\"big\">{what}</span>" },
  /* 자격 */
  "qual.bossKill": { ko: "구간 보스 처치", en: "Slay the stretch boss" },
  "qual.done": { ko: "완료", en: "done" },
  "qual.notYet": { ko: "아직", en: "not yet" },
  "qual.gate": { ko: "{n}층 관문", en: "Floor {n} gate" },
  "qual.ready": { ko: "자격이 찼다. <b>{n}층</b>으로 오를 수 있다 — 탑에서 고르거나, 자동 등반을 켜 두면 바로 올라간다.", en: "You qualify. You may climb to <b>floor {n}</b> — pick it on the tower, or leave auto-climb on and you go straight up." },
  "qual.notReady": { ko: "아직 못 오른다. 위에 남은 것을 채우면 <b>{n}층</b>이 열린다.<br>\n         관문에서 지면 자동 등반이 꺼지고 한 층 내려가 모으게 된다.", en: "Not yet. Fill what is left above and <b>floor {n}</b> opens.<br>\n         Lose at a gate and auto-climb switches off, dropping you a floor to gather." },
  /* 길드 */
  "guild.checkedIn": { ko: "오늘은 이미 받았다. 내일 다시 오면 된다.", en: "Already claimed today. Come back tomorrow." },
  "guild.mealNow": { ko: "지금 <b style=\"color:var(--초록)\">공격 +{pct}%</b> · 남은 <b>{n}판</b><br>", en: "Now <b style=\"color:var(--초록)\">ATK +{pct}%</b> · <b>{n} rounds</b> left<br>" },
  "guild.noMail": { ko: "수령할 우편이 없다.<br>나중에 보상이 오면 여기에 쌓인다.", en: "No mail to collect.<br>Rewards will pile up here later." },
  /* 가방·대원·대장간 */
  "ui.boss": { ko: "보스", en: "Boss" },
  "ui.waiting": { ko: "대기 중", en: "Empty" },
  "ui.noMember": { ko: "대원이 없다", en: "No member" },
  "ui.empty": { ko: "비어 있음", en: "Empty" },
  "ui.slotHint": { ko: "슬롯을 누르면 아래에 가방이 펼쳐진다.", en: "Tap a slot and the bag opens below." },
  "ui.noDesc": { ko: "아직 설명이 없다.", en: "No description yet." },
  "ui.noMats": { ko: "아직 모은 재료가 없다. 탑을 돌면 쌓인다.", en: "No materials yet. They pile up as you run the tower." },
  "ui.noGear": { ko: "만든 장비가 없다. <b>대장간</b>에서 만든다.", en: "No gear made yet. Make it at the <b>forge</b>." },
  "ui.noStones": { ko: "아직 영혼석이 없다. <b>관문 보스</b>를 깨면 가끔 떨어진다.", en: "No soulstones yet. <b>Gate bosses</b> drop them now and then." },
  "ui.marketPrice": { ko: "시장 값", en: "Market price" },
  "ui.usedIn": { ko: "쓰는 곳", en: "Used in" },
  "ui.equippedBy": { ko: "{who}가 낌", en: "Equipped by {who}" },
  "ui.fielded": { ko: "출전", en: "Fielded" },
  "ui.leader": { ko: "대표", en: "Leader" },
  "ui.dupe": { ko: "{g} 동료가 겹쳤다", en: "Duplicate {g} companion" },
  "ui.joined": { ko: "{g} 합류", en: "{g} joins" },
  "ui.pulled": { ko: "나온 것", en: "What you got" },
  "ui.short": { ko: "{n} 모자람 · {where}", en: "{n} short · {where}" },
  "ui.shortGold": { ko: "{n} 모자람", en: "{n} short" },
  "ui.canMake": { ko: "만들 수 있다", en: "Can make" },
  "ui.opensAbove": { ko: "{n}층을 넘으면 열린다", en: "Opens above floor {n}" },
  "ui.fitGain": { ko: "{who}에게 끼우면 +{n}", en: "Fit on {who} for +{n}" },
  "ui.forgeHint": { ko: "만든 것은 <span style=\"color:#f2b45a\">캐릭터</span> 탭에서 슬롯을 눌러 끼운다.", en: "What you make is fitted from the <span style=\"color:#f2b45a\">Roster</span> tab by tapping a slot." },
  "ui.forged": { ko: "대장간에서 <b>{what}</b>을 만들었다.", en: "The forge produced <b>{what}</b>." },
};

/** [옛, 새] — 옛은 파일에 **딱 한 번** 나와야 한다 */
const 짝 = [
  [`if (막힘) 적기("보호막이 돌고 있다. <b>제어</b>라면 한 번에 벗긴다.", "bad");`,
   `if (막힘) 적기(말("log.barrierUp"), "bad");`],
  [`적기("원정대가 다시 섰다.", "good")`, `적기(말("log.partyRose"), "good")`],
  [`적기("원정대가 비었다. 캐릭터 탭에서 태워라.", "die")`, `적기(말("log.partyEmpty"), "die")`],
  [`else 적기(\`상처를 꿰매는 중… (\${S.쉼})\`, "turn");`, `else 적기(말("log.stitching", { n: S.쉼 }), "turn");`],
  [`장면(null, null, \`턴 \${턴}\`, "turn");`, `장면(null, null, 말("log.turn", { n: 턴 }), "turn");`],
  [`장면(null, null, "식당에서 받은 기운이 다했다.", "turn")`, `장면(null, null, 말("log.buffGone"), "turn")`],
  [`장면(null, null, \`<b>\${S.최고층}층</b>으로 오를 <span class="big">자격</span>을 얻었다.\`, "big");`,
   `장면(null, null, 말("log.qualified", { n: S.최고층 }), "big");`],
  [`if (남.length) 장면(null, null, \`\${층}층 자격 — \${자격(층).줄.map((r) => \`\${r.이름} \${r.지금}\`).join(" · ")}\`, "turn");`,
   `if (남.length) 장면(null, null, 말("log.qualProgress", { n: 층, rows: 자격(층).줄.map((r) => \`\${r.이름} \${r.지금}\`).join(" · ") }), "turn");`],
  [`장면(null, null, \`골렘의 잔해 속에서 <b>흑마법사</b>(제어)가 걸어 나왔다.\`, "big");`,
   `장면(null, null, 말("log.darkMageJoins"), "big");`],
  [`적기(\`<b>\${S.층}층</b> 관문에서 무너졌다. 자동 등반을 끄고 <b>\${아래}층</b>으로 물러나 힘을 모은다.\`, "die");`,
   `적기(말("log.gateFell", { n: S.층, m: 아래 }), "die");`],
  [`적기("대장간에서 장비를 갖추고 다시 오면 된다.", "turn");`, `적기(말("log.forgeUp"), "turn");`],
  [`적기(\`원정대가 쓰러졌다. 숨을 고르고 <b>\${S.사냥층}층</b>에 다시 든다.\`, "die");`,
   `적기(말("log.retryFloor", { n: S.사냥층 }), "die");`],
  [`적기("원정대가 물러났다. 구간 처음으로 돌아간다.", "die");`, `적기(말("log.pushedBack"), "die");`],
  [`적기(S.자동오름 ? "자격이 차면 바로 올라간다." : "자격이 차도 이 층에 머문다.", "turn")`,
   `적기(말(S.자동오름 ? "log.autoOn" : "log.autoOff"), "turn")`],
  [`적기("식당에서 한 끼를 차렸다. <b>다음 10판 공격 +5%</b>", "good");`, `적기(말("log.mealServed"), "good");`],
  [`적기("발을 멈추고 탑을 올려다본다.", "");`, `적기(말("log.lookUp"), "");`],
  /* ── 보상 줄 ── */
  [`  let 줄 = \`금화 <b>+\${수(g)}</b> · 균열 파편 +\${파} · 짐승 잔혼 +\${잔}\`;`,
   `  let 줄 = 말("loot.base", { g: 수(g), shard: 말값("균열 파편"), a: 파, remnant: 말값("짐승 잔혼"), b: 잔 });`],
  [`줄 += \` · 단단한 가죽 +\${가}\`;`, `줄 += 말("loot.more", { what: 말값("단단한 가죽"), n: 가 });`],
  [`줄 += \` · 강철 조각 +\${강}\`;`, `줄 += 말("loot.more", { what: 말값("강철 조각"), n: 강 });`],
  [`줄 += \` · 성소의 석편 +\${석}\`;`, `줄 += 말("loot.more", { what: 말값("성소의 석편"), n: 석 });`],
  [`줄 += \` · 늪지 독액 +\${액}\`;`, `줄 += 말("loot.more", { what: 말값("늪지 독액"), n: 액 });`],
  [`줄 += \` · 용암 결정 +\${결}\`;`, `줄 += 말("loot.more", { what: 말값("용암 결정"), n: 결 });`],
  [`줄 += \` · 빙결의 결정 +\${빙}\`;`, `줄 += 말("loot.more", { what: 말값("빙결의 결정"), n: 빙 });`],
  [`줄 += \` · 심연의 정수 +\${수}\`;`, `줄 += 말("loot.more", { what: 말값("심연의 정수"), n: 수 });`],
  [`줄 += \` · \${핵.이름} +\${수량}\`;`, `줄 += 말("loot.more", { what: 말값(핵.이름), n: 수량 });`],
  [`줄 += \` · <span class="big">별가루 +\${별}</span> (첫 클리어)\`;`, `줄 += 말("loot.firstStar", { n: 별 });`],
  [`줄 += " · 수호의 문장 +3";`, `줄 += 말("loot.crest");`],
  [`줄 += \` · <b>별가루 +\${별}</b>\${별 > 50 ? " <i>(찬란한 별가루)</i>" : ""}\`;`,
   `줄 += 말("loot.star", { n: 별 }) + (별 > 50 ? 말("loot.starRadiant") : "");`],
  [`줄 += \` · <span class="big">\${d.이름}</span>\`;`, `줄 += 말("loot.soulstone", { what: 말값(d.이름) });`],
  /* ── 자격 ── */
  [`  if (층 % 10 === 0) 줄.push({ 이름:"구간 보스 처치", 됨: (S.보스깸 ?? []).includes(층), 지금: (S.보스깸 ?? []).includes(층) ? "완료" : "아직" });`,
   `  if (층 % 10 === 0) 줄.push({ 이름:말("qual.bossKill"), 됨: (S.보스깸 ?? []).includes(층), 지금: 말((S.보스깸 ?? []).includes(층) ? "qual.done" : "qual.notYet") });`],
  [`  쪽창(\`\${층}층 관문\`, \`<div class="자격칸">\${자.줄.map((r) =>`, `  쪽창(말("qual.gate", { n: 층 }), \`<div class="자격칸">\${자.줄.map((r) =>`],
  [`      ? \`자격이 찼다. <b>\${층 + 1}층</b>으로 오를 수 있다 — 탑에서 고르거나, 자동 등반을 켜 두면 바로 올라간다.\`
      : \`아직 못 오른다. 위에 남은 것을 채우면 <b>\${층 + 1}층</b>이 열린다.<br>
         관문에서 지면 자동 등반이 꺼지고 한 층 내려가 모으게 된다.\`}</div>\`);`,
   `      ? 말("qual.ready", { n: 층 + 1 })
      : 말("qual.notReady", { n: 층 + 1 })}</div>\`);`],
  /* ── 길드 ── */
  [`쪽창("출석", \`<div class="풀이 on">오늘은 이미 받았다. 내일 다시 오면 된다.</div>\`)`,
   `쪽창(말("tab.checkin") || "출석", \`<div class="풀이 on">\${말("guild.checkedIn")}</div>\`)`],
  [`\${남 > 0 ? \`지금 <b style="color:var(--초록)">공격 +\${Math.round(S.버프.몫*100)}%</b> · 남은 <b>\${남}판</b><br>\` : ""}`,
   `\${남 > 0 ? 말("guild.mealNow", { pct: Math.round(S.버프.몫*100), n: 남 }) : ""}`],
  [`\`<div class="풀이 on">수령할 우편이 없다.<br>나중에 보상이 오면 여기에 쌓인다.</div>\``,
   `\`<div class="풀이 on">\${말("guild.noMail")}</div>\``],
  /* ── 탑·보스 이름 ── */
  [`          <i>\${보스 ? 구간(f).보스.이름 : 말(\`zone.\${((f - 1) % 10) + 1}\`)}</i>`,
   `          <i>\${보스 ? 말값(구간(f).보스.이름) : 말(\`zone.\${((f - 1) % 10) + 1}\`)}</i>`],
];

/** 여러 번 나오는 것 — 바꿀 글도 같다 */
const 여러번 = [
  [`<span class="tag r">보스</span>`, `<span class="tag r">\${말("ui.boss")}</span>`],
  [`<i>대기 중</i>`, `<i>\${말("ui.waiting")}</i>`],
  [`<i>대원이 없다</i>`, `<i>\${말("ui.noMember")}</i>`],
  [`<div class="템이름" style="opacity:.4">비어 있음</div>`, `<div class="템이름" style="opacity:.4">\${말("ui.empty")}</div>`],
  [`<i>슬롯을 누르면 아래에 가방이 펼쳐진다.</i>`, `<i>\${말("ui.slotHint")}</i>`],
  [`"아직 설명이 없다."`, `말("ui.noDesc")`],
  [`<div class="풀이 on">아직 모은 재료가 없다. 탑을 돌면 쌓인다.</div>`, `<div class="풀이 on">\${말("ui.noMats")}</div>`],
  [`<div class="풀이 on">만든 장비가 없다. <b>대장간</b>에서 만든다.</div>`, `<div class="풀이 on">\${말("ui.noGear")}</div>`],
  [`<div class="풀이 on">아직 영혼석이 없다. <b>관문 보스</b>를 깨면 가끔 떨어진다.</div>`, `<div class="풀이 on">\${말("ui.noStones")}</div>`],
  [`<span>시장 값</span>`, `<span>\${말("ui.marketPrice")}</span>`],
  [`<b>쓰는 곳</b>`, `<b>\${말("ui.usedIn")}</b>`],
  [`\${카드(쥔).직업}가 낌`, `\${말("ui.equippedBy", { who: 말값(카드(쥔).직업) })}`],
  [`<span class="tag r">출전</span>`, `<span class="tag r">\${말("ui.fielded")}</span>`],
  [`<span class="tag">대표</span>`, `<span class="tag">\${말("ui.leader")}</span>`],
  [`\${급} 동료가 겹쳤다`, `\${말("ui.dupe", { g: 급 })}`],
  [`<span style="color:var(--금)">\${x.급} 합류</span>`, `<span style="color:var(--금)">\${말("ui.joined", { g: x.급 })}</span>`],
  [`<div class="칸이름">나온 것</div>`, `<div class="칸이름">\${말("ui.pulled")}</div>`],
  [`<i>\${n - 가진} 모자람 · \${재료출처[k] ?? ""}</i>`, `<i>\${말("ui.short", { n: n - 가진, where: 말값(재료출처[k] ?? "") })}</i>`],
  [`<i>\${수(r.금화 - S.금화)} 모자람</i>`, `<i>\${말("ui.shortGold", { n: 수(r.금화 - S.금화) })}</i>`],
  [`<span class="tag r">만들 수 있다</span>`, `<span class="tag r">\${말("ui.canMake")}</span>`],
  [`<i style="color:#6e5d78">\${r.열림}층을 넘으면 열린다</i>`, `<i style="color:#6e5d78">\${말("ui.opensAbove", { n: r.열림 })}</i>`],
  [`<i style="color:var(--초록)">\${쓸.누구}에게 끼우면 +\${수(쓸.폭)}</i>`, `<i style="color:var(--초록)">\${말("ui.fitGain", { who: 말값(쓸.누구), n: 수(쓸.폭) })}</i>`],
  [`<i>만든 것은 <span style="color:#f2b45a">캐릭터</span> 탭에서 슬롯을 눌러 끼운다.</i>`, `<i>\${말("ui.forgeHint")}</i>`],
  [`대장간에서 <b>\${전}</b>을 만들었다.`, `\${말("ui.forged", { what: 말값(전) })}`],
  /* 이름을 찍는 자리 — 말값 을 거치게 한다 */
  [`\${재료이름[k]} \${g[k]}`, `\${말값(재료이름[k])} \${g[k]}`],
  [`<div class="템이름">\${레시피[낀.키].이름}</div>`, `<div class="템이름">\${말값(레시피[낀.키].이름)}</div>`],
  [`data-풀이="기술:\${k}">\${k}</span>`, `data-풀이="기술:\${k}">\${말값(k)}</span>`],
  [`data-풀이="특성:\${k}">\${k}</span>`, `data-풀이="특성:\${k}">\${말값(k)}</span>`],
  [`<b>\${이름}</b><br>`, `<b>\${말값(이름)}</b><br>`],
];

const 탈 = [];
for (const [옛] of 짝) { const n = s.split(옛).length - 1; if (n !== 1) 탈.push(n + "번  " + 옛.slice(0, 72)); }
for (const [옛] of 여러번) { const n = s.split(옛).length - 1; if (n === 0) 탈.push("0번(여러번)  " + 옛.slice(0, 72)); }
if (탈.length) { console.log("**안 쓴다** — 짝이 안 맞았다:"); 탈.forEach((t) => console.log("  " + t)); process.exit(1); }

for (const [옛, 새] of 짝) s = s.replace(옛, 새);
for (const [옛, 새] of 여러번) s = s.split(옛).join(새);

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
const 이미 = new Set([...s.slice(0, i).matchAll(/"((?:log|loot|qual|guild|ui)\.[^"]+)"/g)].map((m) => m[1]));
const 넣을것 = Object.entries(새말).filter(([k]) => !이미.has(k));
const 줄 = ["", "  /* ── 남은 UI 글 (10-24 전세계화 4판) ── */"];
for (const [k, v] of 넣을것) 줄.push("  " + JSON.stringify(k) + ": { ko: " + JSON.stringify(v.ko) + ", en: " + JSON.stringify(v.en) + " },");
s = s.slice(0, i) + 줄.join("\n") + "\n" + s.slice(i);

writeFileSync(경로, s, "utf8");
console.log("UI " + (짝.length + 여러번.length) + "군데 바꿨다 · 말표에 " + 넣을것.length + "줄 넣었다");
