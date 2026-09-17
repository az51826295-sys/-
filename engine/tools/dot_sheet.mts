/**
 * 표정 시트 한 장을 뽑아서 여섯 칸으로 자르고 잰다.
 *
 *   npx tsx engine/tools/dot_sheet.mts <slug> [low|medium|high]
 *
 * 캐릭터 설정은 `dot_characters` 표에서 읽는다 — 코드에 안 적는다. 사장님이 정하는
 * 것이고, 바뀌면 표만 고치면 된다.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
import sharp from "sharp";
import { createServiceClient } from "../../src/lib/supabase/service";
import { createImageProvider } from "../../src/lib/providers/images";
import { sheetPrompt, restylePrompt, cutSheet, measureCells, SHEET_ORDER } from "../../src/lib/dot/sprites";

const slug = process.argv[2] ?? "yuna";
const quality = (process.argv[3] ?? "low") as "low" | "medium" | "high";
const OUT = "C:/Users/az518/AppData/Local/Temp/claude/C--Users-az518-Desktop/d7b8eaa0-592d-4d32-a057-634ae1e64f74/scratchpad/sheet";
mkdirSync(OUT, { recursive: true });

const db = createServiceClient();
const { data: ch } = await db.from("dot_characters").select("id, name, tagline, look, persona").eq("slug", slug).maybeSingle();
if (!ch) throw new Error(`${slug} 이 dot_characters 에 없다`);

// 겉모습은 `look`(그림 주문용 영어), `tagline` 은 목록에 뜨는 한국어 한 줄이다.
const look = { name: ch.name as string, appearance: ((ch.look as string) || (ch.tagline as string)) };
// --ref <slug>: 그 캐릭터의 시트를 **본으로 삼아** 그린다. 화풍을 맞추는 유일하게 듣는 방법.
// 09-09 사장님: "퀄리티 일정하게, 서하랑 같게."
const refAt = process.argv.indexOf("--ref");
const refSlug = refAt > 0 ? process.argv[refAt + 1] : null;
const prompt = refSlug ? restylePrompt(look) : sheetPrompt(look);
console.log(`주문(${refSlug ? "본: " + refSlug : "새로"}):\n${prompt}\n`);

// 저장된 시트로 다시 자르기 — 뭉개는 값을 고칠 때 그림값을 또 내지 않는다.
const reuse = process.argv.includes("--reuse");
let dataUrl: string;
if (reuse) {
  dataUrl = "data:image/png;base64," + readFileSync(`${OUT}/${slug}-sheet.png`).toString("base64");
  console.log("저장된 시트를 다시 자른다 (돈 안 씀)");
} else {
  const t0 = Date.now();
  const drawer = createImageProvider();
  const made = refSlug
    ? await drawer.edit("data:image/png;base64," + readFileSync(`${OUT}/${refSlug}-sheet.png`).toString("base64"), prompt, "1536x1024", quality)
    : await drawer.draw(prompt, quality, "1536x1024");
  console.log(`시트 나옴 · ${quality} · ${((Date.now() - t0) / 1000).toFixed(1)}s · 토큰 in ${made.inputTokens} out ${made.outputTokens}`);
  dataUrl = made.dataUrl;
  writeFileSync(`${OUT}/${slug}-sheet.png`, Buffer.from(made.dataUrl.split(",")[1], "base64"));
}

const cells = await cutSheet(dataUrl);
for (const c of cells) writeFileSync(`${OUT}/${slug}-${c.emotion}.png`, c.png);

const { cases, similarity } = await measureCells(cells);
console.log("\n── 자 ──");
for (const c of cases) console.log(`${c.result === "Passed" ? "✅" : c.result === "Failed" ? "❌" : "◻︎"} ${c.name} — ${c.message}`);
console.log("\n칸별 닮음:");
cells.forEach((c, i) => console.log(`  ${c.emotion.padEnd(10)} 닮음 ${similarity[i].toFixed(2)} · 그림 ${Math.round(c.inkRatio * 100)}%`));

// 여섯 칸을 한 줄로 붙여서 눈으로 보기 좋게.
const strip = await sharp({ create: { width: 6 * 256, height: 256, channels: 3, background: "#ffffff" } })
  .composite(await Promise.all(cells.map(async (c, i) => ({
    input: await sharp(c.png).resize(256, 256, { fit: "contain", background: "#ffffff" }).png().toBuffer(),
    left: i * 256, top: 0,
  }))))
  .png()
  .toBuffer();
writeFileSync(`${OUT}/${slug}-strip.png`, strip);
console.log(`\n→ ${OUT}/${slug}-sheet.png · ${slug}-strip.png · 칸 6장`);
console.log(`   순서: ${SHEET_ORDER.join(" · ")}`);
