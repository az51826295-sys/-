/**
 * 심판자의 이빨 (132회차 09-16).
 *   npx tsx engine/tools/rookery_env.mts engine/tools/judge_teeth.mts <프레임폴더>
 *
 * 108회차 규칙: **자는 고장을 재현해 잡아야 자다.** 통과만 주는 자는 자가 아니다.
 *
 * 넣는 고장은 지어낸 것이 아니라 **실제로 있었던 것**이다:
 *   · 09-07 ~ 09-15 여드레 동안 리눅스 ffmpeg 에 `drawtext` 가 없어 **글자가 한 자도 안 그려졌다.**
 *     그런데 기계 검사 `화면_글자_있음` 은 **대본**의 글자를 세므로 그 여드레 내내 ✅ 였다.
 *     자가 그린 것을 안 보고 계획을 봤기 때문이다 — 심판자는 그린 것을 본다.
 *
 * 그리고 **반대편**을 같이 본다(이게 없으면 그냥 다 떨어뜨리는 자다):
 *   · 멀쩡한 프레임은 통과시켜야 한다.
 *   · 글자 카드만 있는 것은 **흠이 아니다** — 09-09 에 사장님이 생성 그림을 보고 "존나 별로" 라 해서
 *     일부러 글자 카드로 정했다. 주문에 없는 것으로 떨어뜨리면 심판자가 아니라 잔소리다.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import sharp from "sharp";

const DIR = process.argv[2];
if (!DIR) { console.error("프레임 폴더를 달라"); process.exit(1); }

const { judgeWork, judgeLine } = await import("../../src/lib/genesis/judge");
const { defaultProviders } = await import("../../src/lib/execution/shared");
const ai = defaultProviders().ai;

const files = readdirSync(DIR).filter((f) => f.endsWith(".png"));
const pick = (frag: string) => { const f = files.find((x) => x.includes(frag)); if (!f) throw new Error(`없다: ${frag}`); return `${DIR}/${f}`; };

/** 09-07~09-15 의 진짜 고장을 되살린다: 글자가 안 그려진 프레임. 배경은 그대로 두고 글자만 지운다. */
async function blankText(src: string, out: string) {
  const img = sharp(readFileSync(src));
  const { width = 1280, height = 720 } = await img.metadata();
  // 글자가 놓이는 띠(위 15%~65%)를 배경색으로 덮는다 — drawtext 가 아예 안 돈 화면과 같은 모습.
  const bg = await sharp(readFileSync(src)).extract({ left: 0, top: height - 40, width: 40, height: 40 }).resize(width, Math.round(height * 0.55), { kernel: "nearest" }).toBuffer();
  const buf = await img.composite([{ input: bg, top: Math.round(height * 0.12), left: 0 }]).png().toBuffer();
  writeFileSync(out, buf);
  return out;
}

const b64 = (p: string) => readFileSync(p).toString("base64");

/**
 * **실제 주문 그대로** 쓴다(결과물 4069df2d 의 업무). 09-16 첫 판에 내가 엉뚱한 주문("로키 소개")을
 * 붙여 놓고 심판자가 틀렸다고 셌다 — 심판자는 "주문 주제와 불일치" 라며 **내 실수를 잡았다**.
 * 심판대의 정답이 틀리면 심판자를 아무리 재도 헛일이다.
 */
const ORDER_VIDEO = [
  "우리 게임의 첫 3D 레벨을 만드는 규칙 다섯 가지를 60초 설명 영상으로. 이 사실만 쓴다(지어내지 말 것):",
  "1) 바닥은 40×40 m 안. 2) 시작·도전·목표 세 구역, 구역마다 바닥 색이 다르다. 3) 시작점에서 보이는 높이 6 m 랜드마크 하나(주변과 색 대비).",
  "4) 동선은 고리로 시작점에 돌아온다. 5) 동전은 길을 따라 3~5 m 간격, 다음 동전이 늘 보이게.",
  "말투는 해요체, 시청자는 게임을 처음 만드는 사람.",
].join("\n");

/** 처방이 쓸 수 있는 것이 되게 — 이 회사가 실제로 쓰는 연장을 알려 준다(09-16 첫 판에 프리미어를 처방했다). */
const NOTES = [
  "이 영상은 사람이 편집기로 만들지 않는다. 코드가 만든다: 대본을 모델이 쓰고, 목소리는 TTS, **화면 글자는 ffmpeg 의 drawtext 필터가 직접 그린다**, 자막은 SRT 사이드카.",
  "장면은 정지 화면 한 장씩이고 배경은 단색이다. 생성 그림은 09-09 에 일부러 버렸다(사장님이 보고 '존나 별로' — 그림 모델이 글자를 못 쓴다).",
  "그래서 처방은 ffmpeg 필터·대본·TTS 쪽으로 적어야 쓸 수 있다.",
];

/** 진짜 새까만 화면. 대조군이 깨끗해야 대조군이다(09-16: 짙은 회색을 '검은 화면' 대조군으로 썼다가 심판자한테 잡혔다). */
async function pureBlack(out: string) {
  writeFileSync(out, await sharp({ create: { width: 1280, height: 720, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer());
  return out;
}

/**
 * 두 가지를 따로 센다.
 *   · `엄격` — 판정 낱말이 바란 것과 같은가.
 *   · `**헛치명**` — 멀쩡한 것에 '치명' 을 달았는가. **이쪽이 진짜 재려는 것**이다:
 *     심판자가 못 쓰게 되는 길은 둘뿐이다 — 고장을 놓치거나(이빨 없음), 멀쩡한 것을 되돌리거나(잔소리).
 *     '못 봤다' 는 되돌리지 않으므로 잔소리가 아니다. 이 가름은 돌리기 전에 적는다.
 */
let bad = 0, falseFatal = 0, inTok = 0, outTok = 0;
async function run(name: string, images: { label: string; b64: string }[], order: string, want: "통과" | "고쳐야 한다", why: string) {
  const r = await judgeWork(ai, { order, kind: "설명 영상 (프레임 사진)", images, notes: NOTES });
  inTok += r.inputTokens; outTok += r.outputTokens;
  const v = r.verdict;
  const ok = v.verdict === want;
  if (!ok) bad++;
  const fatal = v.faults.filter((f) => f.severity === "치명");
  if (want === "통과" && fatal.length) { falseFatal++; console.log("   (헛치명 — 멀쩡한 것을 되돌리려 했다)"); }
  console.log(`\n${ok ? "통과" : "실패"} ${name}  (바란 것: ${want}, 심판자: ${v.verdict})`);
  console.log(`   ${why}`);
  console.log(`   본 것: ${v.seen.replace(/\s+/g, " ").slice(0, 170)}`);
  console.log(`   ${judgeLine(v)} · 믿음 ${v.confidence}`);
  for (const f of v.faults) console.log(`     · [${f.severity}] ${f.what.slice(0, 110)}`);
  for (const p of v.prescriptions) console.log(`     처방 ${p.spot}: ${p.use.slice(0, 80)} [${p.source ?? "출처 없음"}]`);
}

const good = pick("09-141512_4069df2d_썸네일");
const goodMid = pick("09-141512_4069df2d_중간");
const broken = await blankText(good, `${DIR}/_고장_글자없음.png`);

// ① 반대편 먼저 — 멀쩡한 것을 떨어뜨리면 나머지 점수는 뜻이 없다
await run("멀쩡한 프레임 둘을 통과시킨다", [{ label: "첫 장면", b64: b64(good) }, { label: "중간 장면", b64: b64(goodMid) }], ORDER_VIDEO, "통과",
  "글자 카드만 있는 것은 09-09 에 사장님이 정한 설계다 — 그림 없다고 떨어뜨리면 잔소리다");

// ② 고장 재현 — 여드레 동안 기계 검사가 ✅ 를 준 바로 그 화면
await run("**글자가 안 그려진 프레임을 잡는다**", [{ label: "첫 장면", b64: b64(broken) }], ORDER_VIDEO, "고쳐야 한다",
  "09-07~09-15 실제 고장(drawtext 없음). 기계 `화면_글자_있음` 은 대본을 세므로 여드레 내내 ✅ 였다");

// ③ 같은 '글자 없는 화면' 인데 주문이 바뀌면 판정도 바뀌어야 한다.
// 첫 판에는 짙은 회색 사보타주 화면을 그대로 썼다가 "검정이 아니다" 로 떨어졌는데 — 심판자가 맞았다.
// 대조군이 더러웠던 것이라 **진짜 새까만 화면**으로 다시 만든다.
const black = await pureBlack(`${DIR}/_대조_새까망.png`);
await run("글자 없는 화면도 '검은 화면 3초' 를 시켰으면 통과", [{ label: "인트로 첫 장면", b64: b64(black) }],
  "인트로로 글자 없는 새까만 화면 3초만 넣어 줘. 글자는 넣지 마라.", "통과",
  "같은 '글자 없음' 인데 ②는 떨어지고 ③은 통과해야 한다 — 그래야 그림이 아니라 주문을 보는 것이다");

console.log(`\n엄격(판정 낱말) ${3 - bad}/3 · **헛치명 ${falseFatal}건** · 토큰 들어간 ${inTok.toLocaleString()} 나온 ${outTok.toLocaleString()}`);
console.log(falseFatal === 0 ? "멀쩡한 것을 되돌리려 한 적 없다" : "멀쩡한 것을 되돌리려 했다 — 이러면 쓸 수 없다");
process.exitCode = falseFatal ? 1 : 0;
