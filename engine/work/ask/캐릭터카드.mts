/**
 * **캐릭터 카드를 지피티가 채운다** (10-07 사장님: "지피티가 채워라").
 *   npx tsx engine/work/ask/캐릭터카드.mts <직업> "<그림 설명>"
 * 세계관 원칙을 같이 넘겨서 원신식 카드 한 장을 받는다. 결과는 로키-길드턴제/캐릭터/<직업>.md
 */
import { readFileSync, writeFileSync } from "node:fs";

const 직업 = process.argv[2] ?? "기사";
const 그림 = process.argv[3] ?? "";
const 키 = readFileSync("C:/Users/az518/Desktop/ai-workforce/.env.local", "utf8").match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
if (!키) { console.error("OPENAI_API_KEY 없음"); process.exit(1); }

const 세계 = `
[게임] 모바일 턴제 자동전투 RPG. 화면은 작은 도트 그림 + 아래로 흐르는 전투 글(나레이션). 캐릭터는 가만히 서 있고, 스킬은 파티클(빛)로 보인다.
[세계관] 핵전쟁 5000년 뒤의 중세 판타지. **핵전쟁은 절대 대놓고 말하지 않는다.** 컴퓨터·책·현대 건물 잔해 같은 유물로만 슬쩍 암시한다(유저가 눈치채면 좋고, 못 채도 이상하지 않게).
마법은 존재한다(사람들은 그 근원을 모른다). 원정대는 높은 탑을 오른다(탑의 정체도 말하지 않는다).
[전투] 전부 마법 전투. 방어마법 탱커가 중심. 역할: 방어 / 공격 / 지원(회복) / 제어(보호막 해제).
[뽑기] 원신식 캐릭터 뽑기. 등급: 희귀(파랑) / 영웅(보라) / 전설(노랑). 같은 캐릭터를 또 뽑으면 강해진다(1~6중).
[말투] 전투 글은 짧은 한 문장. 예) "하루이(가) 방어막을 펼쳤다. 막 71"
`;
const 주문 = `${세계}
아래 캐릭터의 카드를 한국어로 채워라. 이 캐릭터를 **뽑고 싶게** 만들되 세계관 원칙을 지켜라.
직업: ${직업}
그림(이미 정해짐, 바꾸지 말 것): ${그림}

형식(그대로, 마크다운):
# [이름] — [직업] · [등급]
- 성격:
- 이야기(한 줄):
- 옛 시대 흔적(티 안 나게, 한 줄):
## 1. 일반공격
이름 / 효과(수치는 공격력 % 로) / 파티클 연출 한 줄 / 전투 글 예시 한 줄
## 2. 스킬
### 스킬
이름 / 효과(수치) / 쿨다운(턴) / 파티클 연출 / 전투 글 예시
### 궁극기
이름 / 효과(수치) / 발동 조건 / 파티클 연출 / 전투 글 예시
## 3. 특성 (패시브 2개)
## 4. 등급과 그 이유 (한 줄)
## 5. 능력치 (체력·공격·방어·속도를 같은 등급 평균 100 기준 상대값으로)
## 6. 중복 (1중~6중 각 한 줄)
`;

const r = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: { authorization: `Bearer ${키}`, "content-type": "application/json" },
  body: JSON.stringify({ model: "gpt-5.6-terra", messages: [{ role: "user", content: 주문 }], max_completion_tokens: 16000 }),
  signal: AbortSignal.timeout(300_000),
});
const j = await r.json() as any;
if (!r.ok) { console.error(`거절 ${r.status}: ${JSON.stringify(j).slice(0, 300)}`); process.exit(1); }
const 글 = j.choices?.[0]?.message?.content ?? "";
if (!글.trim()) { console.error(`빈 답 (끝난 이유 ${j.choices?.[0]?.finish_reason})`); process.exit(1); }
const 나올 = `C:/Users/az518/Desktop/로키-길드턴제/캐릭터/${직업}.md`;
writeFileSync(나올, 글);
const u = j.usage ?? {};
console.log(`${나올} · 토큰 입력 ${u.prompt_tokens} 출력 ${u.completion_tokens} · 약 $${((u.prompt_tokens ?? 0) * 2 / 1e6 + (u.completion_tokens ?? 0) * 12 / 1e6).toFixed(3)}`);
