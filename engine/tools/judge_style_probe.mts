/**
 * 스타일을 보는 눈 (133회차 09-16).
 *   npx tsx engine/tools/rookery_env.mts engine/tools/judge_style_probe.mts <프레임폴더> [--dry]
 *
 * 사장님: **"최신 영상 스타일 분석 기술"**
 *
 * 09-16 에 찾아본 것 둘, 그리고 우리에게 쓸 수 있는 형태:
 *   ① **경계 인식 프레임 고르기**가 균등 고르기를 이기고, **예산이 적을수록 차이가 크다**.
 *      → 남들은 경계를 모델로 찾아야 하지만 **우리는 그냥 안다**(우리가 장면 단위로 지었다). 값 0에 쓴다.
 *   ② 지금 영상 품질 평가는 **잰 값 + LLM 심판**을 같이 쓰고 미학·기술을 따로 점수 낸다.
 *      → `video/style.ts` 가 사실을 대고(명암비·쏠림·안전 여백), 심판자가 판정한다. **문턱은 어디에도 없다.**
 *
 * 왜 잰 값을 대 주나: 132회차 첫 판에 심판자가 "대비가 약해 가독성이 떨어진다" 고 했는데
 * 실제로 재니 **19:1** 이었다. 눈대중이 틀린 것이다. 잴 수 있는 것은 재서 대 준다.
 *
 * 넣는 고장: **글자가 화면 밖으로 넘친다.** 실제로 날 수 있는 고장이고(한글은 라틴보다 넓어 같은 글자 수도 더 길다),
 * 기계 자 `화면_글자_안_넘침` 은 **글자 수만 센다** — 28자 이하면 통과다. 그려진 폭은 아무도 안 본다.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import sharp from "sharp";

const DIR = process.argv[2];
const DRY = process.argv.includes("--dry");
if (!DIR) { console.error("프레임 폴더를 달라"); process.exit(1); }

const { frameStyle, styleLine } = await import("../../src/lib/video/style");
const { judgeWork, judgeLine } = await import("../../src/lib/genesis/judge");

const files = readdirSync(DIR).filter((f) => f.endsWith(".png") && !f.startsWith("_"));
const pick = (frag: string) => { const f = files.find((x) => x.includes(frag)); if (!f) throw new Error(`없다: ${frag}`); return `${DIR}/${f}`; };

/** 글자를 오른쪽으로 밀어 화면 밖으로 흘려보낸다 — 넘친 자막·제목과 같은 모습. */
async function overflow(src: string, out: string) {
  const { width = 1280, height = 720 } = await sharp(readFileSync(src)).metadata();
  const shifted = await sharp(readFileSync(src)).extract({ left: 0, top: 0, width: width - 420, height }).toBuffer();
  const bg = await sharp(readFileSync(src)).extract({ left: 0, top: height - 30, width: 30, height: 30 }).resize(width, height, { kernel: "nearest" }).toBuffer();
  writeFileSync(out, await sharp(bg).composite([{ input: shifted, left: 420, top: 0 }]).png().toBuffer());
  return out;
}

const clean = pick("09-141512_4069df2d_중간");
const spilled = await overflow(clean, `${DIR}/_고장_글자넘침.png`);

const sClean = await frameStyle(readFileSync(clean));
const sSpill = await frameStyle(readFileSync(spilled));
let bad = 0;
const check = (n: string, ok: boolean, got?: unknown) => { if (!ok) bad++; console.log(ok ? "통과" : "실패", n, ok ? "" : JSON.stringify(got)); };

console.log("── 기계가 잰 값 (문턱 없음, 사실만)");
console.log("  멀쩡:", styleLine("장면", sClean));
console.log("  고장:", styleLine("장면", sSpill));
check("멀쩡한 프레임은 안전 여백 안", sClean.touchesEdge === false, sClean);
check("**넘친 프레임은 잘린 것으로 잡힌다**(여백 침범과 가른다)", sSpill.clipped === true && sClean.clipped === false, { spill: sSpill.clipped, clean: sClean.clipped });
check("명암비를 숫자로 낸다(132회차 '대비가 약하다' 는 눈대중이었다)", (sClean.contrast ?? 0) > 15, sClean.contrast);
check("아래 쏠림을 숫자로 낸다", sClean.deadBottom > 0.3, sClean.deadBottom);
console.log(`  (기계 자 '화면_글자_안_넘침' 은 이 고장을 못 본다 — 글자 **수**만 세니까)`);

if (DRY) { console.log(bad ? `\n실패 ${bad}` : "\n전부 통과 (모델 안 부름)"); process.exit(bad ? 1 : 0); }

const { defaultProviders } = await import("../../src/lib/execution/shared");
const ai = defaultProviders().ai;
const ORDER = "우리 게임의 첫 3D 레벨 규칙 다섯 가지를 60초 설명 영상으로. 장면마다 제목과 본문이 화면에 보여야 한다. 말투는 해요체.";
const NOTES = [
  "코드가 만든다: 대본은 모델, 목소리는 TTS, **화면 글자는 ffmpeg 의 drawtext 필터가 그린다**, 자막은 SRT 사이드카.",
  "장면은 단색 배경의 정지 화면이다. 생성 그림은 09-09 에 일부러 버렸다 — **그림이 없는 것은 흠이 아니다.**",
  "화면 글자와 읽는 말은 **다른 것**이다: 화면 글자(제목·본문)는 일부러 **짧은 구절**이고(줄당 28자 이하), 해요체·말투 요구는 **TTS 가 읽는 말**에 걸린다. 사진에는 읽는 말이 안 보인다 — 화면 글자가 명사구인 것은 흠이 아니고, 말투는 사진으로 판단할 수 없다.",
];

let falseFatal = 0, inTok = 0, outTok = 0;
async function ask(name: string, png: string, style: Awaited<ReturnType<typeof frameStyle>>, want: "통과" | "고쳐야 한다") {
  const r = await judgeWork(ai, {
    order: ORDER, kind: "설명 영상 — 장면 한가운데에서 뜬 프레임",
    images: [{ label: "장면 2", b64: readFileSync(png).toString("base64") }],
    notes: NOTES, facts: [styleLine("장면 2", style, 8.2)],
  });
  inTok += r.inputTokens; outTok += r.outputTokens;
  const v = r.verdict, fatal = v.faults.filter((f) => f.severity === "치명");
  if (want === "통과" && fatal.length) falseFatal++;
  const ok = v.verdict === want;
  if (!ok) bad++;
  console.log(`\n${ok ? "통과" : "실패"} ${name} (바란 것 ${want} · 심판자 ${v.verdict}${want === "통과" && fatal.length ? " · **헛치명**" : ""})`);
  console.log(`   점수 주문지킴 ${v.scores.fidelity} · 읽힘 ${v.scores.legibility} · 짜임 ${v.scores.composition} · 믿음 ${v.confidence}`);
  for (const f of v.faults) console.log(`     · [${f.severity}] ${f.what.slice(0, 120)}`);
  for (const p of v.prescriptions.slice(0, 3)) console.log(`     처방 ${p.spot}: ${p.use.slice(0, 90)}`);
  console.log(`   ${judgeLine(v)}`);
  return v;
}

const vc = await ask("멀쩡한 프레임 — 되돌리지 않는다", clean, sClean, "통과");
// 133회차 첫 판의 흠: **통과를 주면서 주문지킴 1 · 읽힘 1** 을 매겼다. 기준점 없는 눈금은 뜻이 없다.
check("통과 판정이면 점수도 통과다운가(어느 칸도 4 미만이 아니다)",
  Math.min(vc.scores.fidelity, vc.scores.legibility, vc.scores.composition) >= 4, vc.scores);
check("읽힘 점수가 잰 명암비(19:1)와 말이 맞는가(7 이상)", vc.scores.legibility >= 7, vc.scores);
const v = await ask("**글자가 화면 밖으로 넘친 프레임을 잡는다**", spilled, sSpill, "고쳐야 한다");
const named = JSON.stringify(v.faults).includes("여백") || JSON.stringify(v.faults).includes("잘") || JSON.stringify(v.faults).includes("넘");
check("넘친 것을 **이름 붙여** 말한다(여백/잘림/넘침)", named, v.faults.map((f) => f.what));

console.log(`\n${bad ? `실패 ${bad}` : "전부 통과"} · 헛치명 ${falseFatal}건 · 토큰 들어간 ${inTok.toLocaleString()} 나온 ${outTok.toLocaleString()}`);
process.exitCode = bad || falseFatal ? 1 : 0;
