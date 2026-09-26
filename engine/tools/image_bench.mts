/**
 * **그림 모델을 나란히 대 본다** (226회차 2026-09-26, 사장님 "그림도 2.5랑 대 봐").
 *
 * 우리는 `gpt-image-2` 하나만 쓰는데 같은 열쇠로 `gpt-image-2.5` 계열과 구글 이미지 모델들이 열려 있다.
 * 기계는 "어느 그림이 더 좋은가" 를 못 잰다 — 그래서 **같은 주문으로 뽑아 나란히 놓고 사장님 눈에 맡긴다.**
 * 잴 수 있는 것(값·시간·크기)만 적는다.
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/image_bench.mts
 */
import fs from "node:fs";
import path from "node:path";

const OUT = process.argv[2] ?? "C:/Users/az518/Desktop/그림-대보기";
// 3D 콘셉트 그림의 실제 주문(meshAssets 의 CONCEPT_FORM 과 같은 뼈대). 메시 품질의 원천이 이 그림 픽셀이라
// 여기서 이기는 모델이 3D 전체를 끌어올린다.
const PROMPT =
  "A single catalogue product photo of ONE object, cut out on a pure white background (#ffffff), " +
  "the white filling the whole frame to every edge — no studio backdrop, no gradient, no vignette. " +
  "ONE object only, ONE viewpoint only. The object is centered and fully visible, lit by flat even " +
  "light like a product listing photo: no rim light, no bloom, no dramatic shadows. " +
  "The object: a closed medieval knight's helmet in weathered silver plate steel, visor down, " +
  "no face visible, fine engraved edges, a dented cheek plate.";

const OPENAI = ["gpt-image-2", "gpt-image-2.5-sunburst", "gpt-image-2.5-flare"];
const GOOGLE = ["gemini-3-pro-image", "gemini-3.1-flash-image"];

fs.mkdirSync(OUT, { recursive: true });
const rows: string[] = [];

for (const model of OPENAI) {
  const t0 = Date.now();
  try {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model, prompt: PROMPT, n: 1, size: "1024x1024", quality: "high", output_format: "png" }),
      signal: AbortSignal.timeout(300_000),
    });
    if (!r.ok) { rows.push(`${model.padEnd(26)} 거절 ${r.status}: ${(await r.text()).slice(0, 120)}`); continue; }
    const j = (await r.json()) as { data: { b64_json?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
    const b64 = j.data?.[0]?.b64_json;
    if (!b64) { rows.push(`${model.padEnd(26)} 그림이 안 왔다`); continue; }
    const buf = Buffer.from(b64, "base64");
    fs.writeFileSync(path.join(OUT, `${model}.png`), buf);
    rows.push(`${model.padEnd(26)} ${((Date.now() - t0) / 1000).toFixed(0)}초 · ${(buf.length / 1024).toFixed(0)} KB · 토큰 ${j.usage?.output_tokens ?? "?"}`);
  } catch (e) { rows.push(`${model.padEnd(26)} 떨어짐: ${e instanceof Error ? e.message.slice(0, 90) : e}`); }
}

for (const model of GOOGLE) {
  const t0 = Date.now();
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": process.env.GEMINI_API_KEY ?? "", "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT }] }] }),
      signal: AbortSignal.timeout(300_000),
    });
    if (!r.ok) { rows.push(`${model.padEnd(26)} 거절 ${r.status}: ${(await r.text()).slice(0, 120)}`); continue; }
    const j = (await r.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[]; usageMetadata?: { candidatesTokenCount?: number } };
    const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part) { rows.push(`${model.padEnd(26)} 그림이 안 왔다`); continue; }
    const buf = Buffer.from(part.inlineData!.data!, "base64");
    const ext = (part.inlineData!.mimeType ?? "image/png").split("/")[1];
    fs.writeFileSync(path.join(OUT, `${model}.${ext}`), buf);
    rows.push(`${model.padEnd(26)} ${((Date.now() - t0) / 1000).toFixed(0)}초 · ${(buf.length / 1024).toFixed(0)} KB · 토큰 ${j.usageMetadata?.candidatesTokenCount ?? "?"}`);
  } catch (e) { rows.push(`${model.padEnd(26)} 떨어짐: ${e instanceof Error ? e.message.slice(0, 90) : e}`); }
}

console.log(`\n=== 같은 주문, ${rows.length}판 ===`);
for (const r of rows) console.log("  " + r);
console.log(`\n${OUT} 에 담았다. 어느 것이 나은지는 사장님 눈이다 — 기계는 못 잰다.`);
