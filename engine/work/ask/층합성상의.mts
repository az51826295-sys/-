/**
 * **층별 내용·합성을 지피티와 상의** (10-07 사장님: "몇층에 뭐가 나오고 뭐 합성해서 물건 만들지도").
 *   npx tsx engine/work/ask/규칙상의.mts → 로키-길드턴제/캐릭터/층과합성-지피티.md
 */
import { readFileSync, writeFileSync } from "node:fs";
const 키 = readFileSync("C:/Users/az518/Desktop/ai-workforce/.env.local", "utf8").match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
const 칸 = "C:/Users/az518/Desktop/로키-길드턴제/캐릭터";
const 기사 = readFileSync(`${칸}/기사.md`, "utf8");
const 정한것 = readFileSync(`${칸}/전투규칙.md`, "utf8");

const 규칙 = readFileSync(`${칸}/규칙상의-지피티.md`, "utf8");
const 주문 = `너는 모바일 수집형 RPG의 콘텐츠·경제 기획자다. 아래 게임의 **층별 내용**과 **합성(제작)** 을 설계해라. 한국어, 표 위주, 숫자를 박아서.

[세계관] 핵전쟁 5000년 뒤의 중세 판타지. **핵전쟁은 절대 대놓고 말하지 않는다** — 컴퓨터·책·현대 건물 잔해 같은 유물로만 슬쩍 암시(눈치 못 채도 이상하지 않게). 마법이 있고, 원정대는 정체를 말하지 않는 높은 탑을 오른다.
[게임] 원신식 뽑기(희귀/영웅/전설) + 턴제 자동전투. 탑 100층, 10층마다 보스, 10구간. 화면은 도트 그림 + 짧은 전투 글.
지금 몬스터 그림: 거대 쥐, 누더기 구울, 초록 슬라임, 녹슨 철 골렘(보스). 지금 구간 이름은 현대 티가 나서 바꿔야 한다: 무너진 지하도·녹슨 환승역·침수된 배수로·잿빛 거주구·봉인된 연구소·붕괴한 격납고·오염된 농장·부서진 발전소·깊은 저장고·옛 세상의 문.
[이미 상의한 전투·성장 규칙(요약해 참고)]
${규칙}
[확정된 첫 캐릭터]
${기사}

[설계할 것]
1. **10구간 표**: 구간 · 층 · 중세 이름 · 한 줄 분위기 · 옛 시대 흔적(티 안 나게) · 일반몹 3종 · 보스(이름, 특징 한 줄, 보호막 여부) · 주요 드롭.
2. **드롭 규칙**: 일반층/보스층/첫 클리어에서 무엇이 얼마나 나오나(골드, 경험, 재료 등급, 돌파 재료 "역할별 문장", 뽑기 재화).
3. **합성(제작)**: 무엇을 만드나(장비 슬롯 몇 개, 소모품 등), 재료 체계(등급·종류 수를 적게), 레시피 예시 8개, 합성 단계(하위 재료 N개 → 상위 1개), 실패 여부, 어디서 하나(지금 탭: 상점·공방·길드·전투·캐릭터 — 공방이 제작).
4. **장비가 능력치에 주는 몫**: 레벨·장비·중복이 각각 전투력의 몇 %를 차지하게 할지.
5. 처음 30분 플레이에 무엇이 열리는지 순서 5줄.
마지막에 "결정이 필요한 것" 3개 이하.`;

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
writeFileSync(`${칸}/층과합성-지피티.md`, 글);
const u = j.usage ?? {};
console.log(`층과합성-지피티.md · 입력 ${u.prompt_tokens} 출력 ${u.completion_tokens} · 약 $${((u.prompt_tokens ?? 0) * 2 / 1e6 + (u.completion_tokens ?? 0) * 12 / 1e6).toFixed(3)}`);
