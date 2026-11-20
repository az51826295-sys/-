/**
 * 그림체 심판 시험지 — 설계·판정식: engine/docs/style-judge-bench-design.md.
 *
 *   npx tsx engine/tools/style_judge_bench.mts --make     시험지 18장 그리기(있는 건 건너뜀)
 *   npx tsx engine/tools/style_judge_bench.mts --judge    심판 둘이 18장을 맞히나
 *
 * 저장소(public)·DB 에 안 올린다. engine/work/style-bench/ 에만.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim().replace(/\r$/, "");
}
import sharp from "sharp";
import { z } from "zod";
const { createImageProvider } = await import("../../src/lib/providers/images");
const { restylePrompt, cutSheet, pixelize, dropToBaseline } = await import("../../src/lib/dot/sprites");
const { outlineSprite } = await import("../../src/lib/dot/outline");
const { 격자, 본 } = await import("../../src/lib/dot/charStandard");
const { costOf } = await import("../../src/lib/costs/pricing");
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { seatProvider } = await import("../../src/lib/skills/appBuild/seats");

const OUT = "engine/work/style-bench", SHEET = "C:/Users/az518/Desktop/두근도트-시트";
mkdirSync(OUT, { recursive: true });
const 그림체 = {
  A: "semi-realistic anime illustration: small head, long realistic body proportions, detailed soft shading, thin lines — NOT chibi",
  B: "western cartoon: very thick black outlines, flat bright colors, exaggerated rubbery shapes, huge oval eyes",
  C: "smooth glossy 3D rendered vinyl toy figure: soft gradients, specular highlights, rounded plastic look",
} as const;
const 배정: Record<string, keyof typeof 그림체> = { doyun: "A", nabi: "A", rin: "A", jiwoo: "B", seoha: "B", yeonu: "B", soeun: "C", taeo: "C", yuna: "C" };

const { data: 사람표, error } = await createServiceClient().from("dot_characters").select("slug,name,look").eq("is_public", true);
if (error || !사람표) throw new Error(`캐스트를 못 읽었다: ${error?.message}`);

async function 무표정(dataUrl: string) {
  const n = (await cutSheet(dataUrl)).find((c) => c.emotion === "neutral")!;
  return dropToBaseline((await outlineSprite(await pixelize(n.png, 격자), 512 / 격자, { 식: "한색", 색: [255, 255, 255] }, 1)).png);
}

if (process.argv.includes("--make")) {
  const 참조 = "data:image/png;base64," + readFileSync(`${SHEET}/${본}-sheet.png`).toString("base64");
  const drawer = createImageProvider("gpt-image-2.5-flare");
  let 돈 = 0;
  for (const [slug, 체] of Object.entries(배정)) {
    const who = 사람표.find((r) => r.slug === slug)!;
    for (const 판 of ["same", "diff"] as const) {
      const 이름 = `${OUT}/${판}-${slug}${판 === "diff" ? "-" + 체 : ""}`;
      if (existsSync(`${이름}-neutral.png`)) continue;
      let prompt = restylePrompt({ name: who.name, appearance: who.look });
      if (판 === "diff") prompt += `\nIMPORTANT CHANGE: do NOT keep the art style. Draw it in this completely different art style instead: ${그림체[체]}. Keep the 3x2 grid, the 6 expressions and the flat magenta background.`;
      try {
        const m = await drawer.edit(참조, prompt, "1536x1024", "low");
        돈 += costOf({ backend: "gpt-image-2.5-flare", inputTokens: m.inputTokens, outputTokens: m.outputTokens });
        writeFileSync(`${이름}-sheet.png`, Buffer.from(m.dataUrl.split(",")[1], "base64"));
        writeFileSync(`${이름}-neutral.png`, await 무표정(m.dataUrl));
        console.log(`그림 ${이름}`);
      } catch (e) { console.log(`못 그림 ${이름}: ${(e as Error).message.slice(0, 120)}`); }
    }
  }
  // 눈으로 볼 띠: 위 줄 같음, 아래 줄 다름(사람 순서 같게)
  const slugs = Object.keys(배정);
  const 칸 = async (p: string) => existsSync(p) ? sharp(p).resize(128, 128, { kernel: "nearest", fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer() : null;
  const parts: { input: Buffer; left: number; top: number }[] = [];
  for (const [i, s] of slugs.entries()) {
    const a = await 칸(`${OUT}/same-${s}-neutral.png`), b = await 칸(`${OUT}/diff-${s}-${배정[s]}-neutral.png`);
    if (a) parts.push({ input: a, left: i * 128, top: 0 }); if (b) parts.push({ input: b, left: i * 128, top: 128 });
  }
  await sharp({ create: { width: 128 * slugs.length, height: 256, channels: 4, background: "#b2c7d9" } }).composite(parts).png().toFile(`${OUT}/sheet-all.png`);
  console.log(`그림값 $${돈.toFixed(3)} · 띠 ${OUT}/sheet-all.png`);
}

if (process.argv.includes("--judge")) {
  const 기준 = [`public/dot-sprites/${본}/neutral.png`, `public/dot-sprites/${본}/happy.png`].map((p) => readFileSync(p).toString("base64"));
  const schema = z.object({ sameStyle: z.number().describe("후보가 기준 그림과 같은 그림체일 확률 0~1"), why: z.string().describe("한 줄") });
  const SYS = [
    "너는 게임 캐릭터 그림체 심사관이다. 처음 두 장은 이 게임의 **기준 그림체**(같은 캐릭터의 두 표정)다. 마지막 한 장이 후보다.",
    "후보는 **다른 캐릭터**다 — 누구인지·머리색·옷은 달라도 된다. 오직 **그림체**가 같은지만 본다:",
    "머리와 몸의 비율, 눈·입을 그리는 방식, 선의 굵기와 색, 명암을 넣는 방식, 전체 인상.",
    "셋 다 도트(픽셀)로 뭉개져 있다 — 도트라는 사실만으로 같다고 하지 마라. 그 아래의 그림체를 봐라.",
  ].join("\n");
  const 시험지 = Object.entries(배정).flatMap(([s, 체]) => [
    { path: `${OUT}/same-${s}-neutral.png`, 정답: true, 이름: `same-${s}` },
    { path: `${OUT}/diff-${s}-${체}-neutral.png`, 정답: false, 이름: `diff-${s}-${체}` },
  ]).filter((x) => existsSync(x.path));
  const 결과: Record<string, unknown[]> = {};
  for (const model of ["gpt-5.6-luna", "gpt-5"]) {
    const ai = await seatProvider(model); if (!ai) { console.log(`${model} 못 앉힘`); continue; }
    let 맞음 = 0, 다름을같음 = 0, 돈 = 0; 결과[model] = [];
    for (const x of 시험지) {
      try {
        const r = await ai.generateStructuredOutput({ systemInstructions: SYS, input: "기준 두 장, 그다음 후보 한 장.", images: [...기준, readFileSync(x.path).toString("base64")], schema, schemaName: "style_judge", maxTokens: 16000, tier: "judgment" });
        돈 += costOf({ backend: r.model, inputTokens: r.inputTokens ?? 0, outputTokens: r.outputTokens ?? 0 });
        const 판 = r.output.sameStyle >= 0.5;
        if (판 === x.정답) 맞음++; if (!x.정답 && 판) 다름을같음++;
        결과[model].push({ ...x, p: r.output.sameStyle, why: r.output.why });
        console.log(`${model} ${x.이름.padEnd(16)} 정답 ${x.정답 ? "같음" : "다름"} · ${r.output.sameStyle.toFixed(2)} ${판 === x.정답 ? "✅" : "❌"}`);
      } catch (e) { console.log(`${model} ${x.이름} 못 잼: ${(e as Error).message.slice(0, 100)}`); }
    }
    const ok = 맞음 >= 16 && 다름을같음 <= 1;
    console.log(`\n${model}: ${맞음}/${시험지.length} · 다름을 같음이라 함 ${다름을같음} → ${ok ? "쓸 만하다" : "못 쓴다"} · 심판값 $${돈.toFixed(3)}\n`);
  }
  writeFileSync(`${OUT}/judge.json`, JSON.stringify(결과, null, 1));
}
