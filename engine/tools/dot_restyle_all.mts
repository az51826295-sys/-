/**
 * **한 결로 전부 다시 그린다** — 11-08 사장님: *"하나 기준점을 정하고 해"*.
 *
 *   npx tsx engine/tools/dot_restyle_all.mts --ref haru --only rin --quality medium
 *   npx tsx engine/tools/dot_restyle_all.mts --ref haru                 ← 기준 뺀 나머지 전부
 *   npx tsx engine/tools/dot_restyle_all.mts --ref haru --up            ← 올리기까지
 *
 * ## 왜 기준 한 장인가
 *
 * 캐릭터마다 따로 뽑으면 **판마다 그리는 사람이 바뀐다**(10-04 에 배운 것). 그래서 기준 시트를
 * 눈앞에 놓고 `restylePrompt` 로 *"그림체는 그대로, 사람만 바꿔"* 를 시킨다.
 *
 * 기준은 **하루**다(11-08). 고른 까닭은 취향이 아니라 해상도다 — 진짜 격자가 64×64 라
 * 인물이 58점이고, 머리 작은 그림체는 얼굴에 10점밖에 안 가서 **눈이 1~2점이 된다.**
 * 두근도트는 친밀도가 표정을 바꾸는 제품이라 표정이 안 읽히면 기능이 죽는다. 머리 큰 셋
 * (도윤·하루·나비) 중 나비는 고양이귀·트윈테일이 따라 묻을 위험이 있고 도윤은 혼자 남자라,
 * 장식 없는 하루가 결만 넘기기에 제일 안전하다.
 *
 * ## 기준 시트는 **조립한다**
 *
 * 뽑을 때 쓴 3×2 원본 시트는 옛 세션 임시폴더와 함께 사라졌다. 표에 남은 것은 잘라 놓은
 * 여섯 장뿐이라, 그 여섯을 다시 3×2 로 붙여 기준으로 쓴다(마젠타 바닥 — 자르는 쪽이 보는 색).
 *
 * ## 돈
 *
 * 한 장이 곧 한 사람이다(6칸이 한 장에 들어간다). 쓴 토큰과 값을 사람마다 적는다.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * **DB 는 .env.local, 그림 열쇠는 둘 중 되는 쪽** (11-08).
 *
 * `rookery_env.mts` 를 씌우면 쓸 만한 OPENAI 열쇠가 들어오지만, 같이 Supabase 주소까지
 * **로키(rookery-main)** 로 갈아끼운다 — 그 프로젝트는 사라져서 DNS 조차 안 뜬다
 * ([[rookery-prod-db-is-gone]]). 두근도트 표는 `.env.local` 쪽에 있다.
 * 그래서 DB 는 `.env.local` 값으로 **못 박고**, 열쇠는 래퍼가 넣어 준 것이 있으면 그것을 쓴다.
 */
const 적힌것 = new Map<string, string>();
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) 적힌것.set(l.slice(0, i).trim(), l.slice(i + 1).trim());
}
for (const [k, v] of 적힌것) process.env[k] ||= v;
const DB주소 = 적힌것.get("NEXT_PUBLIC_SUPABASE_URL")!;
const DB열쇠 = 적힌것.get("SUPABASE_SECRET_KEY")!;
const sharp = (await import("sharp")).default;
const { createClient } = await import("@supabase/supabase-js");
const { restylePrompt, cutSheet, measureCells, SHEET_ORDER } = await import("../../src/lib/dot/sprites");
const { createImageProvider } = await import("../../src/lib/providers/images");
const { alignSprite } = await import("../../src/lib/dot/align");

const 끌 = (이름: string) => { const i = process.argv.indexOf(이름); return i > 0 ? process.argv[i + 1] : null; };
const 기준slug = 끌("--ref") ?? "haru";
const 한명만 = 끌("--only");
const quality = (끌("--quality") ?? "medium") as "low" | "medium" | "high";
const 올릴까 = process.argv.includes("--up");
const 나갈곳 = 끌("--out") ?? "C:/Users/az518/Desktop/로키-도트/다시-20261108";
mkdirSync(나갈곳, { recursive: true });

const db = createClient(DB주소, DB열쇠, { auth: { autoRefreshToken: false, persistSession: false } });
type Row = { slug: string; name: string; look: string | null; tagline: string | null; sprites: Record<string, string> | null; is_public: boolean | null };
const { data, error } = await db.from("dot_characters").select("slug, name, look, tagline, sprites, is_public");
if (error) { console.error("표를 못 읽었다:", error.message); process.exit(1); }
const 모두 = (data as Row[]).filter((c) => c.is_public).sort((a, b) => a.slug.localeCompare(b.slug));
const 기준 = 모두.find((c) => c.slug === 기준slug);
if (!기준?.sprites) { console.error(`기준 ${기준slug} 의 그림이 없다`); process.exit(1); }

/* ── 기준 시트 조립: 3×2 · 칸 512 · 마젠타 바닥 ── */
const 칸 = 512;
const 조각: sharp.OverlayOptions[] = [];
for (let i = 0; i < SHEET_ORDER.length; i++) {
  const url = 기준.sprites![SHEET_ORDER[i]];
  if (!url) { console.error(`기준에 ${SHEET_ORDER[i]} 칸이 없다`); process.exit(1); }
  const r = await fetch(url);
  if (!r.ok) { console.error(`기준 ${SHEET_ORDER[i]} 를 못 받았다 (${r.status})`); process.exit(1); }
  조각.push({ input: Buffer.from(await r.arrayBuffer()), left: (i % 3) * 칸, top: Math.floor(i / 3) * 칸 });
}
const 기준시트 = await sharp({ create: { width: 칸 * 3, height: 칸 * 2, channels: 4, background: { r: 255, g: 0, b: 255, alpha: 1 } } })
  .composite(조각).png().toBuffer();
writeFileSync(join(나갈곳, `_기준-${기준slug}.png`), 기준시트);
console.log(`기준 시트 조립: ${기준.name} (${칸 * 3}×${칸 * 2}) → ${join(나갈곳, `_기준-${기준slug}.png`)}`);

/* ── 그릴 사람 ── */
const 그릴사람 = 모두.filter((c) => c.slug !== 기준slug && (!한명만 || c.slug === 한명만));
if (!그릴사람.length) { console.error("그릴 사람이 없다"); process.exit(1); }
console.log(`그릴 사람 ${그릴사람.length}명: ${그릴사람.map((c) => c.name).join(" · ")} · 품질 ${quality}\n`);

/**
 * **그리는 쪽을 고른다** (11-08).
 *
 * OpenAI 열쇠가 죽어 있다(HTTP 401 — 돈이 아니라 열쇠다 [[wrong-key-is-not-no-money]]).
 * 그런데 Gemini 열쇠는 살아 있고 **모델 61개 중 그림이 8개** 열려 있다
 * ([[idle-power-already-paid-for]] — 이미 산 힘부터 센다). 그래서 기본값을 Gemini 로 둔다.
 * `--engine openai` 로 되돌릴 수 있다(열쇠를 새로 받으면).
 */
const 엔진 = 끌("--engine") ?? "gemini";
const 제미나이모델 = 끌("--model") ?? "gemini-3-pro-image";
const GEMINI = (() => {
  const p = `${process.env.LOCALAPPDATA}/rookery-dot/gemini.json`;
  try { return JSON.parse(readFileSync(p, "utf8")).apiKey as string; } catch { return process.env.GEMINI_API_KEY ?? ""; }
})();
if (엔진 === "gemini" && !GEMINI) { console.error("Gemini 열쇠가 없다"); process.exit(1); }

/** 기준 그림을 눈앞에 놓고 그리게 한다 — 글만으로는 결이 안 맞는다(10-04). */
async function 제미나이로(ref: Buffer, prompt: string) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${제미나이모델}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": GEMINI, "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ inlineData: { mimeType: "image/png", data: ref.toString("base64") } }, { text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "3:2" } },
    }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
    usageMetadata?: { candidatesTokenCount?: number };
  };
  const p = j.candidates?.[0]?.content?.parts?.find((x) => x.inlineData?.data);
  if (!p) throw new Error("그림이 안 왔다");
  return {
    dataUrl: `data:${p.inlineData!.mimeType ?? "image/png"};base64,${p.inlineData!.data}`,
    outputTokens: j.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

const drawer = 엔진 === "openai" ? createImageProvider() : null;
const 기준URL = "data:image/png;base64," + 기준시트.toString("base64");
let 토큰합 = 0;
console.log(`그리는 쪽: ${엔진}${엔진 === "gemini" ? ` (${제미나이모델})` : ` (${quality})`}\n`);

for (const c of 그릴사람) {
  const look = { name: c.name, appearance: (c.look || c.tagline || "").trim() };
  if (!look.appearance) { console.log(`건너뜀  ${c.name} — 겉모습(look) 칸이 비었다`); continue; }
  const t0 = Date.now();
  let made: { dataUrl: string; outputTokens: number };
  try {
    made = 엔진 === "openai"
      ? await drawer!.edit(기준URL, restylePrompt(look), "1536x1024", quality)
      : await 제미나이로(기준시트, restylePrompt(look));
  } catch (e) { console.log(`실패    ${c.name} — ${(e as Error).message}`); continue; }
  토큰합 += made.outputTokens;
  const dir = join(나갈곳, c.slug); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "_sheet.png"), Buffer.from(made.dataUrl.split(",")[1], "base64"));

  const cells = await cutSheet(made.dataUrl);
  const { cases, similarity } = await measureCells(cells);
  const 걸린것 = cases.filter((x) => x.result === "Failed");
  /* 자른 뒤 바로 바닥선까지 맞춘다 — 올리는 그림은 처음부터 정렬된 것이어야 한다. */
  const 발밑: number[] = [];
  for (const cell of cells) {
    const { png, report } = await alignSprite(cell.png);
    writeFileSync(join(dir, `${cell.emotion}.png`), png);
    발밑.push(report.footBefore);
  }
  console.log(
    `${c.name.padEnd(5)} ${((Date.now() - t0) / 1000).toFixed(0)}s · 토큰 ${made.outputTokens} · ` +
    `닮음 ${(similarity.reduce((s, x) => s + x, 0) / similarity.length).toFixed(2)} · ` +
    `걸린 자 ${걸린것.length}${걸린것.length ? ` (${걸린것.map((x) => x.name).join(",")})` : ""} · 발밑 전 ${[...new Set(발밑)].join("/")}`,
  );
}

console.log(`\n나간 곳: ${나갈곳}`);
console.log(`출력 토큰 합계 ${토큰합.toLocaleString()} — 값은 원장(rookery_cost)에서 확인할 것`);

if (!올릴까) { console.log("\n(그리기만 했다. 눈으로 보고 괜찮으면 --up)\n"); process.exit(0); }

let 올린수 = 0;
for (const c of 그릴사람) {
  for (const e of SHEET_ORDER) {
    const p = join(나갈곳, c.slug, `${e}.png`);
    let body: Buffer; try { body = readFileSync(p); } catch { continue; }
    const { error: err } = await db.storage.from("dot-sprites").upload(`${c.slug}/${e}.png`, body, { contentType: "image/png", upsert: true, cacheControl: "60" });
    if (err) { console.error(`${c.slug}/${e}: ${err.message}`); process.exit(1); }
    올린수++;
  }
}
console.log(`\n↑ ${올린수}장 올림`);
