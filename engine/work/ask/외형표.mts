/**
 * **캐릭터 외형표를 지피티가 만든다** (10-07 사장님: 얼굴이 다 같다 → 외형표 → 한 명씩).
 *   npx tsx engine/work/ask/외형표.mts → 로키-길드턴제/캐릭터/외형표.md
 * 마지막에 `PROMPT <이름>: <영어 한 줄>` 을 받아 dot_캐릭터.mts 가 그대로 쓴다.
 */
import { readFileSync, writeFileSync } from "node:fs";
const 키 = readFileSync("C:/Users/az518/Desktop/ai-workforce/.env.local", "utf8").match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
const 칸 = "C:/Users/az518/Desktop/로키-길드턴제/캐릭터";
const 기사 = readFileSync(`${칸}/기사.md`, "utf8");
const 이전표 = (() => { try { return readFileSync(`${칸}/외형표-사람.md`, "utf8"); } catch { return ""; } })();

const 주문 = `너는 원신 같은 수집형 게임의 캐릭터 디자이너다. 아래 4명의 **외형**을 정해라. 한국어 표 + 마지막에 영어 그림 주문.

[세계관] 핵전쟁 5000년 뒤의 중세 판타지. 핵전쟁은 절대 티 내지 않는다 — 옛 시대 물건은 아주 작은 디테일로만(눈치 못 채도 이상하지 않게).
[그림] 치비 도트(약 2.5등신, 큰 눈), 64×64 전신 스프라이트, 오른쪽을 본다. 작은 그림이라 **멀리서 실루엣과 색만으로 구별**되어야 한다.
[문제] 지금은 넷이 모두 갈색 머리·같은 눈·같은 얼굴이라 누가 누군지 모른다. 이걸 고치는 게 목적이다.
[10-07 새 설정 — 사장님] **플레이어 캐릭터는 전부 동물이다.** 아주 오래전 일로 동물들이 유전자 변이를 겪어 지능을 얻었고,
두 발로 서서 갑옷·옷을 입고 무기를 쓴다(수인 치비). 이 설정도 대놓고 말하지 않는다 — 그냥 그런 세상이다.
**적은 지능을 못 얻은 짐승·괴물**(거대 쥐·슬라임·박쥐·골렘)이라, 아군 동물은 그것들과 헷갈리지 않는 종이어야 한다(쥐·박쥐 금지).
사람은 그림에 나오지 않는다. 네 명은 **서로 다른 종**이고, 종의 실루엣(귀·꼬리·덩치·주둥이)으로 멀리서도 구별돼야 한다.
역할에 어울리는 종을 골라라(예시일 뿐: 방패 기사에 어울리는 단단한 종 등). 성별·성격·대표색·상징 소품은 카드와 이전 외형표를 최대한 살린다.
[4명]
1. 세리안 — 기사 · 방어 · 전설 (카드 확정, 아래). 지금 갈색 포니테일은 예전 그림에서 따온 것이라 바꿔도 된다. 파란 갑옷·방패 가운데 검은 판·방패 테두리 파란 빛은 유지.
2. 리안 — 검사 · 공격 · 영웅 (카드 대기). 일반공격: 베기.
3. 미르 — 회복술사 · 지원 · 영웅 (카드 대기). 일반공격: 단일 힐.
4. 세라 — 흑마법사 · 제어 · 영웅 (카드 대기). 일반공격: 마법탄, 스킬: 사슬로 보호막을 끊는다.
지금은 넷 다 소녀다. 그대로 둬도 되고 바꿔도 되지만, 바꾸면 이유를 한 줄.

[이전 외형표(사람판) — 색·성격·소품을 살릴 것]
${이전표}

[세리안 카드]
${기사}

[형식]
## 외형표
| 이름 | 종 · 성별·나이대 | 털색·머리모양 | 눈 색 | 얼굴·표정 | 대표 색 2개 | 실루엣 특징 | 상징 소품 | 옛 시대 흔적(아주 작게) |
## 서로 안 겹치나 (머리색·눈색·대표색·실루엣이 4명 모두 다른지 한 줄씩 확인)
## 그림 주문
각 줄을 정확히 이 형식으로, 영어로, 한 줄에 하나:
PROMPT 세리안: <외형만 묘사한 영어 2~3문장, 첫머리에 "An anthropomorphic <species>" 로 시작. 포즈·배경·화풍 말은 넣지 말 것>
PROMPT 리안: ...
PROMPT 미르: ...
PROMPT 세라: ...`;

const r = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: { authorization: `Bearer ${키}`, "content-type": "application/json" },
  body: JSON.stringify({ model: "gpt-5.6-terra", messages: [{ role: "user", content: 주문 }], max_completion_tokens: 16000 }),
  signal: AbortSignal.timeout(300_000),
});
const j = await r.json() as any;
if (!r.ok) { console.error(`거절 ${r.status}: ${JSON.stringify(j).slice(0, 300)}`); process.exit(1); }
const 글 = j.choices?.[0]?.message?.content ?? "";
const 주문들 = [...글.matchAll(/^PROMPT\s+(\S+?):\s*(.+)$/gm)];
if (주문들.length < 4) { console.error(`그림 주문이 ${주문들.length}줄뿐 (끝난 이유 ${j.choices?.[0]?.finish_reason})`); writeFileSync(`${칸}/외형표.md`, 글); process.exit(1); }
writeFileSync(`${칸}/외형표.md`, 글);
const u = j.usage ?? {};
console.log(`외형표.md · 주문 ${주문들.length}줄 · 약 $${((u.prompt_tokens ?? 0) * 2 / 1e6 + (u.completion_tokens ?? 0) * 12 / 1e6).toFixed(3)}`);
