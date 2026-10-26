/**
 * **파인튜닝 재료를 쌓는다** (10-26). 값: 한 바퀴 약 $0.03 (딥시크).
 *   GENESIS_SPEND=i-approve npx tsx engine/tools/voice_dataset.mts [--n 3]
 *
 * 사장님: "비서같이 말투 만들어 파인튜닝해."
 *
 * 파인튜닝엔 예시가 수십~수백 개 필요하다. 지금 손으로 쓴 건 여덟이다.
 * 그래서 **자를 통과한 답만 주워 모은다** — 비서 말투를 붙여 돌리고,
 * `checkVoice` 에서 어긋남이 0인 답만 남긴다. 사람 손이 안 들어간 재료는
 * 쓸 수 없으니 **사장님이 지우거나 고칠 수 있게 jsonl 로** 쌓는다.
 *
 * 쌓는 곳: `engine/work/voice/dataset.jsonl` (OpenAI 대화 형식)
 *
 * **자가 통과시킨 것이 좋은 답이라는 보장은 없다.** 자는 열 가지 규칙만 센다 —
 * 사람이 읽고 비서 같은지는 안 잰다. 그래서 이 파일은 **초안**이고, 사장님이
 * 훑어 지운 뒤에 쓰는 것이 맞다([[pick-session-judge]]: 마지막 칸은 사람이 고른다).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { checkVoice, voiceScore, secretaryNote, SECRETARY_EXAMPLES, type VoiceOptions } from "../../src/lib/chat/voice";
import { selfNote } from "../../src/lib/chat/persona";

if (process.env.GENESIS_SPEND !== "i-approve") {
  console.error("돈이 든다(약 $0.03). GENESIS_SPEND=i-approve 로 돌려라.");
  process.exit(1);
}

const N = Number(process.argv[process.argv.indexOf("--n") + 1]) || 3;
const 쌓는곳 = "engine/work/voice/dataset.jsonl";
mkdirSync(dirname(쌓는곳), { recursive: true });

const env = readFileSync("C:/Users/az518/Desktop/ai-workforce/.env.local", "utf8");
const 열쇠 = (env.match(/^DEEPSEEK_API_KEY=(.*)$/m) ?? [])[1]?.trim();
if (!열쇠) { console.error("DEEPSEEK_API_KEY 가 없다."); process.exit(1); }

/**
 * 파인튜닝에 들어갈 시스템 줄. **예시는 빼고** 규칙만 — 말투를 몸에 익히면 예시가 필요 없다.
 *
 * **일감을 여기에 같이 넣어야 한다.** 처음엔 규칙만 넣고 돌렸는데, 주워 모은 답에
 * "$0.19·17건·339ms" 같은 **사실**이 들어 있었다. 그대로 학습시키면
 * "배포 됐어?" → "아직입니다, 17건" 을 **영구히 사실로 외운다.** 말투를 가르치려다
 * 거짓말을 가르치는 것이다.
 *
 * 사실을 시스템 줄에 같이 두면 모델이 배우는 것은 `사실 → 비서 말투` 변환이고,
 * 그게 우리가 원하는 것이다.
 */
const 말투규칙 = "너는 로키다. 사장님의 비서처럼 말한다. 됐는지 안 됐는지를 첫 줄에, 못 한 것은 '못 했습니다' 라고, 사장님 손이 필요한 것은 맨 뒤에 모아서 명령형으로. 사실은 아래에 적힌 것만 쓴다.";

const 일감 = [
  "## 이 회사의 일 (지금 사실)",
  "- MCP 콘센트: 끝남. 검사 16개 전부 통과, 한 장 재는 데 339ms.",
  "- 앱→노트북 고리: 코드만 끝남. 테이블이 없어서 못 돌려 봤다.",
  "- 배포: 안 나간 것 17건.",
  "- 사장님 손: ① SQL 한 장 붙이기 ② railway up ③ 구글 시크릿 새로 발급",
  "- 지출: 이번 달 $0.19. 한도 $14.",
].join("\n");

/** 실제로 사장님이 치는 모양의 말들. 지어낸 말로 모으면 지어낸 말투가 쌓인다. */
const 물음들: { 물음: string; opts: VoiceOptions }[] = [
  ...["배포 됐어?", "그거 끝난 거 맞아?", "지금 돈 얼마 썼어?", "내가 뭐 해야 돼",
    "할 거 정리해줘", "그거 왜 안 됐어", "MCP 되는 거야?", "노트북 고리 됐어?",
    "뭐가 제일 급해?", "이거 얼마나 걸려?", "그럼 지금 뭐가 막혀 있어?",
    "어제 그거 어떻게 됐어", "돈 더 써야 돼?", "다 된 거야?", "뭐 빠진 거 없어?",
  ].map((물음) => ({ 물음, opts: { owner: true } as VoiceOptions })),
  ...["ㅋㅋ 오늘 학교에서 개웃긴 일 있었는데", "나 사문 4따리야", "아 수능 두 달 남았네",
  ].map((물음) => ({ 물음, opts: { owner: true, smalltalk: true } as VoiceOptions })),
];

const 시스템 = selfNote() + "\n" + 일감 + "\n" + secretaryNote();
/** 학습 줄에도 **같은 일감**이 들어간다 — 그래야 모델이 사실을 외우지 않고 변환을 배운다. */
const 학습용시스템 = 말투규칙 + "\n\n" + 일감;

/** 이미 쌓인 것 — 같은 답을 두 번 넣지 않는다. */
const 이미 = new Set<string>();
if (existsSync(쌓는곳)) {
  for (const 줄 of readFileSync(쌓는곳, "utf8").split("\n").filter(Boolean)) {
    try {
      const j = JSON.parse(줄) as { messages: { role: string; content: string }[] };
      const a = j.messages.find((m) => m.role === "assistant")?.content;
      if (a) 이미.add(a.trim());
    } catch { /* 깨진 줄은 건너뛴다 */ }
  }
}
console.log(`이미 쌓인 것 ${이미.size}개`);

let 들어온토큰 = 0, 나간토큰 = 0, 넣음 = 0, 떨어뜨림 = 0, 겹침 = 0, 못잼 = 0;
const 떨어진까닭: Record<string, number> = {};

async function 묻기(user: string): Promise<string | null> {
  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + 열쇠 },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "system", content: 시스템 }, { role: "user", content: user }],
      max_tokens: 700, temperature: 0.9,   /* 조금 흔들어야 같은 답만 쌓이지 않는다 */
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

/* 손으로 쓴 예시는 처음에 한 번 그대로 넣는다 — **첫 예시가 거의 전부다.** */
if (이미.size === 0) {
  for (const e of SECRETARY_EXAMPLES) {
    appendFileSync(쌓는곳, JSON.stringify({
      messages: [
        { role: "system", content: 학습용시스템 },
        { role: "user", content: e.물음 },
        { role: "assistant", content: e.답 },
      ],
    }) + "\n", "utf8");
    이미.add(e.답.trim());
    넣음++;
  }
  console.log(`손으로 쓴 예시 ${넣음}개를 먼저 넣었다`);
}

const t0 = Date.now();
for (const q of 물음들) {
  for (let i = 0; i < N; i++) {
    const 답 = await 묻기(q.물음);
    if (답 === null) { 못잼++; continue; }     /* 못 닿은 것은 나쁜 답이 아니다 */
    const s = voiceScore(checkVoice(답, q.opts));
    if (s.fail > 0) {
      떨어뜨림++;
      for (const f of s.failed) {
        const k = f.split(" (")[0];
        떨어진까닭[k] = (떨어진까닭[k] ?? 0) + 1;
      }
      continue;
    }
    if (이미.has(답.trim())) { 겹침++; continue; }
    이미.add(답.trim());
    appendFileSync(쌓는곳, JSON.stringify({
      messages: [
        { role: "system", content: 학습용시스템 },
        { role: "user", content: q.물음 },
        { role: "assistant", content: 답.trim() },
      ],
    }) + "\n", "utf8");
    넣음++;
  }
  process.stdout.write(".");
}

const 까닭순 = Object.entries(떨어진까닭).sort((a, b) => b[1] - a[1]).slice(0, 4);
console.log(`\n\n넣음 ${넣음} · 자가 떨어뜨림 ${떨어뜨림} · 겹침 ${겹침}${못잼 ? ` · 못 잼 ${못잼}` : ""}`);
if (까닭순.length) console.log(`떨어진 까닭: ${까닭순.map(([n, v]) => `${n} ${v}회`).join(" · ")}`);
console.log(`모두 ${이미.size}개 → ${쌓는곳}`);

const 값 = (들어온토큰 / 1e6) * 0.28 + (나간토큰 / 1e6) * 0.42;
console.log(`어림 $${값.toFixed(4)} · ${((Date.now() - t0) / 1000).toFixed(0)}초`);

/* 파인튜닝은 보통 예시 50개부터 쓸만해진다. 몇 개 모자란지 **숫자로** 말한다. */
const 목표 = 50;
console.log(이미.size >= 목표
  ? `파인튜닝에 쓸 만큼 모였다 (${이미.size} ≥ ${목표}). 사장님이 훑어 지운 다음에 쓴다.`
  : `${목표 - 이미.size}개 더 필요하다 (지금 ${이미.size}). 다시 돌리면 쌓인다.`);
console.log("못 잰 것: 사람이 읽고 '비서 같다' 고 느끼는지. 자는 규칙 열 가지만 센다.");
