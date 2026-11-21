/**
 * 3단계 그림 시험 — 설계·판정식: engine/docs/director-art-design.md (잠금 9d99e72).
 *
 *   npx tsx engine/tools/director_art_ab.mts --screen     네 자리가 yuna 를 한 번씩
 *   npx tsx engine/tools/director_art_ab.mts --main       거르기에서 갈렸을 때만: 여덟 명 × 끔/켬
 *
 * 저장소(public)·DB 에 **안 올린다.** 그림은 engine/work/director-art/<판>/ 에만.
 * 길은 운영(`dot_new_character`)과 같은 함수: restyle(참조 haru) → cutSheet → pixelize(격자) → 흰 테두리 → dropToBaseline.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim().replace(/\r$/, "");
}
import sharp from "sharp";
const { createImageProvider } = await import("../../src/lib/providers/images");
const { restylePrompt, cutSheet, measureCells, pixelize, dropToBaseline } = await import("../../src/lib/dot/sprites");
const { outlineSprite, outlineShare, OUTLINE_MIN } = await import("../../src/lib/dot/outline");
const { measureBody } = await import("../../src/lib/dot/charMeasure");
const { 격자, 기준, 본 } = await import("../../src/lib/dot/charStandard");
const { costOf } = await import("../../src/lib/costs/pricing");
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { decide } = await import("../../src/lib/director/index");
const { seatProvider } = await import("../../src/lib/skills/appBuild/seats");
type Seat = import("../../src/lib/director/index").Seat;
type LedgerEntry = import("../../src/lib/director/index").LedgerEntry;

const SHEET = "C:/Users/az518/Desktop/두근도트-시트";
const OUT = "engine/work/director-art";
const 자리들 = [
  { id: "flare-low", model: "gpt-image-2.5-flare", quality: "low" as const, outPerMTok: 30, note: "운영 모델을 낮은 품질로. 싸고 빠르다." },
  { id: "flare-medium", model: "gpt-image-2.5-flare", quality: "medium" as const, outPerMTok: 30, note: "운영 기본." },
  { id: "sunburst-medium", model: "gpt-image-2.5-sunburst", quality: "medium" as const, outPerMTok: 30, note: "같은 세대의 다른 판." },
  { id: "img2-medium", model: "gpt-image-2", quality: "medium" as const, outPerMTok: 40, note: "한 세대 전. 느리고 비싸다." },
];
const 끔자리 = "flare-medium";
const texel = 512 / 격자;

const db = createServiceClient();
const { data: 사람표, error } = await db.from("dot_characters").select("slug,name,look").eq("is_public", true).order("slug");
if (error || !사람표) throw new Error(`캐스트를 못 읽었다: ${error?.message}`);
const 참조 = readFileSync(`${SHEET}/${본}-sheet.png`).toString("base64");

type Trial = { seat: string; slug: string; pass: boolean | null; fails: string[]; usd: number; sec: number; 팔?: string; 판단?: unknown };

async function 한판(seatId: string, slug: string, 판: string): Promise<Trial> {
  const s = 자리들.find((x) => x.id === seatId)!;
  const who = 사람표!.find((r) => r.slug === slug)!;
  const dir = `${OUT}/${판}`; mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  let made;
  try {
    made = await createImageProvider(s.model).edit("data:image/png;base64," + 참조, restylePrompt({ name: who.name, appearance: who.look }), "1536x1024", s.quality);
  } catch (e) {
    return { seat: seatId, slug, pass: null, fails: [`못 잼: 그림 호출 실패 — ${(e as Error).message.slice(0, 160)}`], usd: 0, sec: (Date.now() - t0) / 1000 };
  }
  const usd = costOf({ backend: s.model, inputTokens: made.inputTokens, outputTokens: made.outputTokens });
  const sec = (Date.now() - t0) / 1000;
  writeFileSync(`${dir}/${seatId}-${slug}-sheet.png`, Buffer.from(made.dataUrl.split(",")[1], "base64"));

  const fails: string[] = [];
  let cells;
  try {
    const 자른것 = await cutSheet(made.dataUrl);
    cells = await Promise.all(자른것.map(async (c) => {
      const p = await pixelize(c.png, 격자);
      const o = (await outlineSprite(p, texel, { 식: "한색", 색: [255, 255, 255] }, 1)).png;
      return { ...c, png: await dropToBaseline(o) };
    }));
  } catch (e) {
    return { seat: seatId, slug, pass: false, fails: [`자르기·뭉개기 실패: ${(e as Error).message.slice(0, 160)}`], usd, sec };
  }
  // 1. 여섯 칸 자
  const { cases } = await measureCells(cells);
  for (const c of cases) if (c.result === "Failed") fails.push(`${c.name}: ${c.message}`);
  // 2. 테두리
  for (const c of cells) { const r = await outlineShare(c.png, texel); if (r.비율 < OUTLINE_MIN) fails.push(`테두리 ${c.emotion} ${(r.비율 * 100).toFixed(0)}%`); }
  // 3. 42px 구별 — dot_new_character 와 같은 셈(6%). 그 도구에서 떼어 내지 않고 베꼈다: 이 판 뒤 한 곳으로 모을 것.
  {
    const raws = await Promise.all(cells.map(async (c) => { const { data, info } = await sharp(c.png).resize(42, 42, { kernel: "nearest" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, ch: info.channels }; }));
    let minDiff = 1;
    for (let i = 0; i < raws.length; i++) for (let j = i + 1; j < raws.length; j++) {
      const A = raws[i], B = raws[j]; let d = 0, n = 0;
      for (let p = 0; p < A.data.length; p += A.ch) { if (A.data[p + 3] < 128 && B.data[p + 3] < 128) continue; n++; if (Math.abs(A.data[p] - B.data[p]) + Math.abs(A.data[p + 1] - B.data[p + 1]) + Math.abs(A.data[p + 2] - B.data[p + 2]) > 60) d++; }
      minDiff = Math.min(minDiff, n ? d / n : 0);
    }
    if (minDiff < 0.06) fails.push(`42px 구별 ${(minDiff * 100).toFixed(1)}%`);
  }
  // 4. 무표정 몸 숫자
  const neutral = cells.find((c) => c.emotion === "neutral")!;
  const b = await measureBody(neutral.png, texel);
  if (b.높이칸 < 기준.높이칸[0] || b.높이칸 > 기준.높이칸[1]) fails.push(`높이 ${b.높이칸}칸`);
  if (b.폭칸 < 기준.폭칸[0] || b.폭칸 > 기준.폭칸[1]) fails.push(`폭 ${b.폭칸}칸`);
  if (b.색수 < 기준.색수[0] || b.색수 > 기준.색수[1]) fails.push(`색 ${b.색수}`);
  if (b.아래여백 !== 기준.아래여백) fails.push(`아래여백 ${b.아래여백}`);
  const 테 = await outlineShare(neutral.png, texel); if (테.비율 < 기준.테두리) fails.push(`무표정 테두리 ${(테.비율 * 100).toFixed(0)}%`);

  // 사람이 볼 띠
  const strip = await sharp({ create: { width: 256 * 6, height: 256, channels: 4, background: "#b2c7d9" } })
    .composite(await Promise.all(cells.map(async (c, i) => ({ input: await sharp(c.png).resize(256, 256, { kernel: "nearest", fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(), left: i * 256, top: 0 }))))
    .png().toBuffer();
  writeFileSync(`${dir}/${seatId}-${slug}-strip.png`, strip);
  return { seat: seatId, slug, pass: fails.length === 0, fails, usd, sec };
}

const 줄 = (t: Trial) => `${t.팔 ? t.팔 + " " : ""}${t.seat} · ${t.slug} → ${t.pass === null ? "못 잼" : t.pass ? "통과" : "실패"} · $${t.usd.toFixed(3)} · ${t.sec.toFixed(0)}초${t.fails.length ? "\n     " + t.fails.join("\n     ") : ""}`;

if (process.argv.includes("--screen")) {
  const 결과: Trial[] = [];
  for (const s of 자리들) { const t = await 한판(s.id, "yuna", "screen"); 결과.push(t); console.log(줄(t)); }
  writeFileSync(`${OUT}/screen.json`, JSON.stringify(결과, null, 1));
  const 잰 = 결과.filter((t) => t.pass !== null), 넘 = 잰.filter((t) => t.pass).length;
  const 판정 = !잰.length ? "다 못 잼 — 열쇠·모델부터" : 넘 === 잰.length ? "다 통과 → 갈리지 않음, 본판 안 돌림" : 넘 === 0 ? "다 못 넘음 → 본판 안 돌림, 원인부터" : "갈림 → 본판";
  console.log(`\n거르기: 잰 ${잰.length}/4 · 통과 ${넘} → ${판정} · 값 $${결과.reduce((a, t) => a + t.usd, 0).toFixed(3)}`);
}

if (process.argv.includes("--main")) {
  const 거르기 = JSON.parse(readFileSync(`${OUT}/screen.json`, "utf8")) as Trial[];
  const 장부: LedgerEntry[] = 거르기.filter((t) => t.pass !== null).map((t) => ({ at: "", task: "yuna 다시 그리기", kind: "캐릭터그림", seat: t.seat, effort: "normal", predictedPass: 0.5, passed: !!t.pass, usd: t.usd, sec: t.sec }));
  const seats: Seat[] = 자리들.map((s) => ({ id: s.id, outPerMTok: s.outPerMTok, sees: true, note: s.note }));
  const brain = await seatProvider("gpt-5.6-luna"); if (!brain) throw new Error("판단자 못 앉힘");
  const 대상 = 사람표.map((r) => r.slug).filter((s) => s !== 본 && s !== "yuna");
  const 결과: Trial[] = [];
  for (const [i, slug] of 대상.entries()) {
    const 차례 = i % 2 ? ["켬", "끔"] : ["끔", "켬"];
    for (const 팔 of 차례) {
      let seat = 끔자리, 판단: unknown;
      if (팔 === "켬") {
        const who = 사람표.find((r) => r.slug === slug)!;
        const d = await decide(brain as never, { task: `두근도트 캐릭터 "${who.name}" 를 표정 여섯 칸 도트 시트로 다시 그린다. 겉모습: ${who.look}`, kind: "캐릭터그림", seats, ledger: 장부 }, (u) => costOf({ backend: u.model, inputTokens: u.inputTokens, outputTokens: u.outputTokens }));
        seat = d.seat; 판단 = d;
      }
      const t = { ...(await 한판(seat, slug, "main")), 팔, 판단 };
      if (팔 === "켬") {
        const d = 판단 as { predictedPass: number; usd: number; via: LedgerEntry["via"] };
        t.usd += d.usd;
        if (t.pass !== null) 장부.push({ at: new Date().toISOString(), task: slug, kind: "캐릭터그림", seat, effort: "normal", predictedPass: d.predictedPass, passed: t.pass, usd: t.usd - d.usd, sec: t.sec, via: d.via, judgeUsd: d.usd });
      }
      결과.push(t); console.log(줄(t));
      writeFileSync(`${OUT}/main.json`, JSON.stringify(결과, null, 1));
    }
  }
  const 팔셈 = (p: string) => { const xs = 결과.filter((t) => t.팔 === p && t.pass !== null); return { n: xs.length, pass: xs.filter((t) => t.pass).length, usd: xs.reduce((a, t) => a + t.usd, 0) / Math.max(1, xs.length) }; };
  const 끔 = 팔셈("끔"), 켬 = 팔셈("켬");
  const 기본고름 = 결과.filter((t) => t.팔 === "켬" && t.seat === 끔자리).length;
  const 차 = 켬.pass - 끔.pass;
  const 판정 = 기본고름 >= 7 ? "판정 안 냄(켬이 기본 자리를 일곱 번 이상 골랐다)"
    : 차 >= 2 ? "일을 한다(통과)" : 차 <= -2 ? "해를 끼친다" : 차 >= -1 && 켬.usd <= 끔.usd * 0.85 ? "일을 한다(값)" : "구분 안 됨";
  console.log(`\n끔 ${끔.pass}/${끔.n} · 판당 $${끔.usd.toFixed(3)}  |  켬 ${켬.pass}/${켬.n} · 판당 $${켬.usd.toFixed(3)} · 기본 자리 ${기본고름}/8 → ${판정}`);
}

/* `--one=자리:사람,자리:사람` — 정한 판만 그린다(결 자 검증용, 11-21). 무표정 칸도 따로 남긴다. */
const one = process.argv.find((a) => a.startsWith("--one="));
if (one) {
  for (const pair of one.slice(6).split(",")) {
    const [seat, slug] = pair.split(":");
    const t = await 한판(seat, slug, "verify");
    console.log(줄(t));
    const b64 = readFileSync(`${OUT}/verify/${seat}-${slug}-sheet.png`).toString("base64");
    const n = (await cutSheet("data:image/png;base64," + b64)).find((c) => c.emotion === "neutral")!;
    const o = (await outlineSprite(await pixelize(n.png, 격자), texel, { 식: "한색", 색: [255, 255, 255] }, 1)).png;
    writeFileSync(`${OUT}/verify/${seat}-${slug}-neutral.png`, await dropToBaseline(o));
  }
}
