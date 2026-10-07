/**
 * **전투 규칙·레벨링을 지피티와 상의** (10-07 사장님: "이건 지피티랑 상의해 레벨링도").
 *   npx tsx engine/work/ask/규칙상의.mts → 로키-길드턴제/캐릭터/규칙상의-지피티.md
 */
import { readFileSync, writeFileSync } from "node:fs";
const 키 = readFileSync("C:/Users/az518/Desktop/ai-workforce/.env.local", "utf8").match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
const 칸 = "C:/Users/az518/Desktop/로키-길드턴제/캐릭터";
const 기사 = readFileSync(`${칸}/기사.md`, "utf8");
const 정한것 = readFileSync(`${칸}/전투규칙.md`, "utf8");

const 주문 = `너는 모바일 수집형 RPG의 전투·성장 기획자다. 아래 게임의 전투 규칙과 레벨링을 **추천**해라. 한국어, 짧고 구체적으로, 숫자를 박아서.

[게임] 원신식 캐릭터 뽑기(희귀/영웅/전설, 중복 1~6중) + 턴제 **자동** 전투. 플레이어는 파티 편성·성장만 하고 전투는 지켜본다.
탑 100층, 10층마다 보스. 1층 일반몹 체력 60·공격 9, 층마다 적 수치 ×1.105(100층이면 약 2만 배가 아니라 1.105^99≈19,500배 — 이 곡선이 너무 가파르면 고쳐라).
보스: 체력 260·공격 14 ×같은 배율, 20층부터 "보호막"(제어 역할만 해제)을 두른다.
지금 아군 공식(임시): 최대체력 = (60 + 레벨×14)×역할배율, 공격 = (8 + 레벨×2.6)×역할배율. 경험: 층 하나 넘길 때 12, 레벨업 필요 = 30 + 레벨×18. 파티 최대 5명.
역할: 방어 / 공격 / 지원(회복) / 제어(보호막 해제).
[이미 정한 것]
${정한것}
[확정된 첫 캐릭터 카드]
${기사}

[추천할 것] 각 항목마다: **추천안 한 줄 → 공식/숫자 → 이유 한두 줄 → 대안 하나**.
1. 방어 공식 (후보: A 피해×100/(100+방어), B 피해−방어, C 방어 1당 0.1% 최대 50%) — 세리안 방어 162가 깨지지 않게.
2. 쿨다운 (턴 세는 법, 전투 시작 때 바로 쓸 수 있나)
3. 궁극기 충전 (캐릭터마다 다른 조건 vs 공통 게이지)
4. 도발 (무엇을 끌고 몇 턴, 여러 명이 도발하면)
5. 레벨링: 경험 얻는 곳, 필요 경험 곡선, 레벨 상한과 돌파(등급별 차이), 능력치 성장(등급별 기본값·성장률), 같은 레벨 희귀 vs 전설 격차.
6. 위 규칙으로 **100층까지 갈 수 있는지** 대략 검산: 파티 평균 레벨 몇에 몇 층 보스를 깨나 표 5줄.
마지막에 "결정이 필요한 것" 3개 이하로.`;

const r = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: { authorization: `Bearer ${키}`, "content-type": "application/json" },
  body: JSON.stringify({ model: "gpt-5.6-terra", messages: [{ role: "user", content: 주문 }], max_completion_tokens: 16000 }),
  signal: AbortSignal.timeout(400_000),
});
const j = await r.json() as any;
if (!r.ok) { console.error(`거절 ${r.status}: ${JSON.stringify(j).slice(0, 300)}`); process.exit(1); }
const 글 = j.choices?.[0]?.message?.content ?? "";
if (!글.trim()) { console.error(`빈 답 (${j.choices?.[0]?.finish_reason})`); process.exit(1); }
writeFileSync(`${칸}/규칙상의-지피티.md`, 글);
const u = j.usage ?? {};
console.log(`규칙상의-지피티.md · 입력 ${u.prompt_tokens} 출력 ${u.completion_tokens} · 약 $${((u.prompt_tokens ?? 0) * 2 / 1e6 + (u.completion_tokens ?? 0) * 12 / 1e6).toFixed(3)}`);
