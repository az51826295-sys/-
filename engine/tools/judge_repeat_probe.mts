/**
 * 심판자가 같은 것을 같게 보는가 (134회차 09-16).
 *   npx tsx engine/tools/rookery_env.mts engine/tools/judge_repeat_probe.mts <프레임폴더> [--runs N]
 *
 * 09-16 조사가 가져온 숫자 — **화면을 보는 AI 를 문으로 쓴 것을 셋이 따로 쟀고 전부 나빴다**:
 *   · DiffSpot(2026-05): CSS 한 줄 차이 4,400쌍에서 **최고 모델이 40.7%** 만 잡음
 *   · VideoGameQA-Bench(소니 연구자 공저): 시각 회귀 시험 **45.2%**
 *   · EA 자사 QA 영상 19,738 프레임: **정밀도 0.50**
 *   · FailBench(2026-09): 애매하면 **'성공' 쪽으로 기우는 편향**이 있고 **생각을 더 시켜도 안 없어진다**
 *     → 즉 이런 문은 **열린 채로 고장 난다**. 문이 없는 것보다 나쁘다(없는 자신감을 만들어 내니까).
 *   · Rating Roulette(EMNLP 2025): 같은 판을 세 번 물으면 **61.3%** 만 세 번 다 같은 답
 *
 * 우리는 132회차부터 **문으로 안 쓴다**(판정은 기계 자가 내고 심판자는 옆에 적는다). 그 선택이 맞았다는 증거다.
 * 하지만 마지막 줄은 우리도 재야 한다: **우리 심판자는 같은 그림에 같은 답을 하는가.**
 * 흔들리면, 오늘 7/7 통과한 것도 그날 운이었다는 뜻이다.
 */
import { readFileSync, readdirSync } from "node:fs";

const DIR = process.argv[2];
const RUNS = Number(process.argv[process.argv.indexOf("--runs") + 1]) || 3;
if (!DIR) { console.error("프레임 폴더를 달라"); process.exit(1); }

const { frameStyle, styleLine } = await import("../../src/lib/video/style");
const { judgeWork } = await import("../../src/lib/genesis/judge");
const { defaultProviders } = await import("../../src/lib/execution/shared");
const ai = defaultProviders().ai;

const files = readdirSync(DIR).filter((f) => f.endsWith(".png"));
const pick = (frag: string) => { const f = files.find((x) => x.includes(frag)); if (!f) throw new Error(`없다: ${frag}`); return `${DIR}/${f}`; };

const ORDER = [
  "우리 게임의 첫 3D 레벨을 만드는 규칙 다섯 가지를 60초 설명 영상으로.",
  "1) 바닥은 40×40 m 안. 2) 시작·도전·목표 세 구역. 3) 높이 6 m 랜드마크 하나. 4) 동선은 고리. 5) 동전은 3~5 m 간격.",
].join("\n");
const NOTES = [
  "코드가 만든다: 대본은 모델, 목소리는 TTS, 화면 글자는 ffmpeg drawtext, 자막은 SRT 사이드카.",
  "장면은 단색 배경의 정지 화면이다. 그림이 없는 것은 흠이 아니다(09-09 에 일부러 정한 설계).",
  "화면 글자는 짧은 구절이고 말투 요구는 읽는 말에 걸린다 — 사진으로 말투는 판단할 수 없다.",
];

let inTok = 0, outTok = 0, unstable = 0;

async function repeat(name: string, png: string) {
  const style = await frameStyle(readFileSync(png));
  const b64 = readFileSync(png).toString("base64");
  const verdicts: string[] = [], fatals: number[] = [], scores: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const r = await judgeWork(ai, {
      order: ORDER, kind: "설명 영상 — 장면 한가운데에서 뜬 프레임",
      images: [{ label: "장면 2", b64 }], notes: NOTES, facts: [styleLine("장면 2", style, 8.2)],
    });
    inTok += r.inputTokens; outTok += r.outputTokens;
    verdicts.push(r.verdict.verdict);
    fatals.push(r.verdict.faults.filter((f) => f.severity === "치명").length);
    const sc = Object.values(r.verdict.scores);
    scores.push(sc.reduce((a, b) => a + b, 0) / sc.length);
  }
  const same = new Set(verdicts).size === 1;
  const fatalSame = new Set(fatals.map((f) => f > 0)).size === 1;
  if (!same || !fatalSame) unstable++;
  const lo = Math.min(...scores), hi = Math.max(...scores);
  console.log(`\n${same ? "통과" : "**실패**"} ${name}`);
  console.log(`   판정 ${RUNS}번: ${verdicts.join(" · ")}${same ? "  (같다)" : "  ← **흔들린다**"}`);
  console.log(`   치명 개수: ${fatals.join(" · ")}${fatalSame ? "" : "  ← **되돌릴지 말지가 판마다 다르다**"}`);
  console.log(`   평균 점수 ${lo.toFixed(1)}~${hi.toFixed(1)} (폭 ${(hi - lo).toFixed(1)})`);
  return { same, fatalSame, spread: hi - lo };
}

const clean = pick("09-141512_4069df2d_중간");
const spilled = pick("_고장_글자넘침");

const a = await repeat("멀쩡한 프레임 — 같은 답이 나오는가", clean);
const b = await repeat("잘린 프레임 — 같은 답이 나오는가", spilled);

console.log(`\n══ 흔들린 입력 ${unstable}/2 · 토큰 들어간 ${inTok.toLocaleString()} 나온 ${outTok.toLocaleString()}`);
console.log(unstable === 0
  ? "   같은 그림에 같은 답을 한다. (바깥 자료의 61.3% 보다 낫다 — 단 표본 2개다)"
  : "   **같은 그림에 다른 답을 한다.** 이러면 한 번 돌린 점수는 그날 운이다 — 여러 번 물어 다수결을 해야 한다.");
console.log(`   점수 폭: 멀쩡 ${a.spread.toFixed(1)} · 잘림 ${b.spread.toFixed(1)} (점수는 판정보다 늘 더 흔들린다)`);
process.exitCode = unstable ? 1 : 0;
