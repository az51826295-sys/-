/**
 * **비서 말투가 진짜 모델에서 지켜지나** (10-26). 값: 딥시크 호출 32번 ≈ $0.01.
 *   GENESIS_SPEND=i-approve npx tsx engine/tools/voice_live.mts
 *
 * 사장님: "비서같이 말투 만들어."
 *
 * **대조군을 같이 돌린다.** 09-27 에 로키 지시문을 세 군데서 재 봤더니 0~4점이었고
 * 값을 한 것은 모델 자리(+46)였다 — 대조군 없이 "지시문이 좋아졌다" 고 적으면 거짓이다.
 *   · A(대조군): 지금 성격만
 *   · B: 지금 성격 + 비서 말투
 *
 * **한 번만 재면 흔들림이 안 보인다**(09-27: 한 번씩 6/6 → 다섯 번씩 3/10).
 * 그래서 메시지마다 N번 돌리고 갈라 센다.
 *
 * 판정은 기계가 한다(`checkVoice`). 모델이 모델을 채점하지 않는다.
 * 로키 DB 를 안 쓴다 — 열쇠만 쓴다.
 */
import { readFileSync } from "node:fs";
import { checkVoice, voiceScore, secretaryNote, type VoiceOptions } from "../../src/lib/chat/voice";
import { selfNote } from "../../src/lib/chat/persona";

if (process.env.GENESIS_SPEND !== "i-approve") {
  console.error("돈이 든다(약 $0.01). GENESIS_SPEND=i-approve 로 돌려라.");
  process.exit(1);
}

const N = Number(process.argv[process.argv.indexOf("--n") + 1]) || 2;

const env = readFileSync("C:/Users/az518/Desktop/ai-workforce/.env.local", "utf8");
const 열쇠 = (env.match(/^DEEPSEEK_API_KEY=(.*)$/m) ?? [])[1]?.trim();
if (!열쇠) { console.error("DEEPSEEK_API_KEY 가 없다."); process.exit(1); }

/**
 * 실제로 사장님이 쳤던 말들. 지어낸 말로 재면 지어낸 결과가 나온다.
 *
 * 위 일감을 **쓸 수밖에 없는** 물음들이다 — 그래야 비서 말투가 바꾸는 칸이 쓰인다.
 * 잡담 하나는 반대편이다: 없으면 "보고만 하는 자" 를 만들게 된다(09-16 과 같은 이유).
 */
const 판: { 물음: string; opts: VoiceOptions }[] = [
  { 물음: "앱이랑 내 노트북에 있는 클로드 코드랑 연결 됨?", opts: { owner: true } },
  { 물음: "배포 됐어?", opts: { owner: true } },
  { 물음: "지금 돈 얼마 썼어?", opts: { owner: true } },
  { 물음: "그거 왜 안 됐어", opts: { owner: true } },
  { 물음: "할 거 정리해줘", opts: { owner: true } },
  { 물음: "MCP 그거 끝난 거 맞아?", opts: { owner: true } },
  { 물음: "내가 뭐 해야 돼", opts: { owner: true } },
  { 물음: "그 우성이라고 사문 4따리 있거든?", opts: { owner: true, smalltalk: true } },
];

/**
 * **일거리를 같이 넣는다.**
 *
 * 처음엔 안 넣고 쟀더니 A 18/24 · B 18/24 로 **차이가 0** 이었다. 당연했다 —
 * 비서 말투가 바꾸는 칸은 "됐는지 먼저 말하기 · 부탁은 뒤에 모으기 · 못 한 것을
 * '못 했습니다' 라고 쓰기" 인데, **일거리가 없으면 그 칸을 쓸 일이 없다.**
 * 자가 보는 범위가 제품 범위와 달랐던 것과 같은 모양이다([[ruler-scope-must-match-product]]).
 *
 * 그래서 실제 화면이 넣어 주는 것과 같은 모양의 일감을 붙인다.
 */
const 일감 = [
  "",
  "## 이 회사의 일 (지금 사실)",
  "- MCP 콘센트: 끝남. 검사 16개 전부 통과, 한 장 재는 데 339ms.",
  "- 앱→노트북 고리: 코드만 끝남. laptop_jobs 테이블이 없어서 **못 돌려 봤다**.",
  "- 배포: 안 나간 것 17건.",
  "- 사장님 손이 필요한 것: ① Supabase SQL 편집기에 schema_laptop_jobs.sql 붙이기",
  "  ② railway up --service rookery-web ③ 구글 클라이언트 시크릿 새로 발급",
  "- 지출: 이번 달 $0.19. 한도 $14.",
].join("\n");

const 기본 = selfNote();
const 조건: { 이름: string; prompt: string }[] = [
  { 이름: "A 대조군", prompt: 기본 + "\n" + 일감 },
  { 이름: "B 비서말투", prompt: 기본 + "\n" + 일감 + "\n" + secretaryNote() },
];

let 들어온토큰 = 0, 나간토큰 = 0;

async function 묻기(system: string, user: string): Promise<string | null> {
  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + 열쇠 },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      max_tokens: 700, temperature: 0.7,
    }),
    signal: AbortSignal.timeout(120_000),
  }).catch(() => null);
  if (!r || !r.ok) return null;
  const j = await r.json() as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  들어온토큰 += j.usage?.prompt_tokens ?? 0;
  나간토큰 += j.usage?.completion_tokens ?? 0;
  return j.choices?.[0]?.message?.content ?? null;
}

const 결과: Record<string, { 통과: number; 전체: number; 못잼: number; 어긴것: Record<string, number> }> = {};
for (const c of 조건) 결과[c.이름] = { 통과: 0, 전체: 0, 못잼: 0, 어긴것: {} };

const t0 = Date.now();
for (const q of 판) {
  console.log(`\n■ ${q.물음}`);
  for (const c of 조건) {
    for (let i = 0; i < N; i++) {
      const 답 = await 묻기(c.prompt, q.물음);
      const 칸 = 결과[c.이름];
      if (답 === null) { 칸.못잼++; continue; }   /* 못 닿은 것은 어긋남이 아니다 */
      칸.전체++;
      const s = voiceScore(checkVoice(답, q.opts));
      if (s.fail === 0) 칸.통과++;
      for (const f of s.failed) {
        const 키 = f.split(" (")[0];
        칸.어긴것[키] = (칸.어긴것[키] ?? 0) + 1;
      }
      if (i === 0) {
        const 첫 = 답.split("\n").filter(Boolean)[0] ?? "";
        console.log(`  ${c.이름}: ${s.fail === 0 ? "·" : "≠"} ${답.split("\n").filter(Boolean).length}줄 · "${첫.slice(0, 44)}"`);
        if (s.fail) console.log(`     어긴 것: ${s.failed.join(" / ")}`);
      }
    }
  }
}

console.log(`\n${"=".repeat(60)}`);
for (const c of 조건) {
  const k = 결과[c.이름];
  const 어긴순 = Object.entries(k.어긴것).sort((a, b) => b[1] - a[1]).slice(0, 4);
  console.log(`${c.이름}  통과 ${k.통과}/${k.전체}${k.못잼 ? ` · 못 잼 ${k.못잼}` : ""}`);
  if (어긴순.length) console.log(`   많이 어긴 것: ${어긴순.map(([n, v]) => `${n} ${v}회`).join(" · ")}`);
}

/* 딥시크 단가(2026-10 기준, 캐시 미적용): 들어오는 토큰 $0.28/M · 나가는 토큰 $0.42/M.
   단가는 바뀐다 — 숫자를 믿지 말고 장부(플랫폼 사용량)로 맞춰 봐야 한다. */
const 값 = (들어온토큰 / 1e6) * 0.28 + (나간토큰 / 1e6) * 0.42;
console.log(`\n토큰 들어온 ${들어온토큰} · 나간 ${나간토큰} → 어림 $${값.toFixed(4)} · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
console.log("못 잰 것: 사람이 읽고 '비서 같다' 고 느끼는지. 자는 규칙만 센다.");
