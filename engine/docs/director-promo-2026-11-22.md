# Rookery Director 홍보 초안 (11-22)

원칙: **잰 것만 쓴다.** 후기·사용자 수 지어내지 않는다. 손님 장부 숫자가 없다는 것도 같이 쓴다.
링크: 소개 https://az51826295-sys.github.io/rookery-director/ · 설치 `claude mcp add rookery-director -- npx rookery-director`

---

## ① 긱뉴스 Show GN (news.hada.io/show) — 한국어, 1순위

**제목**: Show GN: Rookery Director – 일마다 어느 AI에 맡길지 정하고, 스스로 채점하는 MCP 서버

**링크**: https://az51826295-sys.github.io/rookery-director/

**본문**:
- AI를 여러 개 쓰면서 "이건 비싼 모델 써야 하나?"를 매번 감으로 정하는 게 불편해서 만들었습니다.
- Claude Code 등에 MCP 서버로 붙이면, 일 하나마다 **어느 AI에 얼마나 공들여 맡길지** 정하고 **통과 확률을 먼저 적어 잠급니다.** 결과를 적으면 스스로 채점(Brier)하고, 떨어지면 한 칸 위 AI로 다시 시킵니다.
- 같은 종류의 일이 장부로 증명되면 판단 AI를 부르지 않고 바로 답합니다(판단 값 $0).
- 직접 잰 것:
  - 숨긴 시험이 있는 코드 일 29판 → 제일 싼 AI가 전부 통과(다 비싼 AI로 돌렸다면 출력 단가 8배)
  - 반대로 그림체 심사 18장 → 싼 AI 13/18, 비싼 AI 16/18. 일마다 맞는 자리가 다릅니다
  - 싼 판단자 한 번 $0.0007, 비싼 판단자와 15/15 같은 선택
- 로컬에서만 돌고(BYOK, 판단자는 본인 OpenAI 키), 장부는 본인 컴퓨터에만 남습니다. 저희 서버는 없습니다.
- 한 달 100판 무료, 그 뒤 Pro 월 $9.
- 아직 부족한 점: 판단자는 OpenAI 키만, 엔진 답은 한국어만, 숫자는 만든 사람 장부뿐입니다. **같이 써 보고 장부 숫자를 나눠 주실 분**을 찾습니다.

설치: `claude mcp add rookery-director -- npx rookery-director`

---

## ② X / 스레드 — 짧게

AI 여러 개 쓰면서 매번 감으로 고르시나요?
Rookery Director는 일마다 어느 AI에 맡길지 정하고, 통과 확률을 먼저 잠근 뒤 스스로 채점하는 MCP 서버입니다.
코드 일 29판은 제일 싼 AI로 충분했고, 그림 심사는 아니었습니다(13/18 vs 16/18).
로컬·내 키·월 100판 무료.
https://az51826295-sys.github.io/rookery-director/

---

## ③ MCP 목록 등록 — 영어 한 줄 (awesome-mcp-servers 등)

- **Rookery Director** (`npx rookery-director`) — Decides which AI and how much effort per task, locks a pass prediction first, scores itself (Brier) and escalates on failure. Local, BYOK. *(Engine output is Korean for now.)*

해외 목록은 엔진 답이 영어가 된 뒤가 낫다 — 지금 올리면 받는 사람이 한국어 답을 본다.

---
## 올린 것 (11-22 00:2x)
- X @mk31uwhs: ② 줄인 판(246/280)
- awesome-mcp-servers PR punkpeye/awesome-mcp-servers#20261 (Coding Agents, 한 줄)
