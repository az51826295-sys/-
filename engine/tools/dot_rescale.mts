/**
 * **한 인물을 다른 인물들 크기에 맞춘다** (226회차 2026-09-28, 사장님 "넣어").
 *
 *   npx tsx engine/tools/dot_rescale.mts yuna            # 재고 만들기만(바탕화면)
 *   npx tsx engine/tools/dot_rescale.mts yuna --올림      # 저장소에 올리고 표를 바꾼다
 *
 * 09-28 싹 점검에서 인물 **안**은 96장 전부 통과인데 인물 **끼리**가 걸렸다:
 *   유나 잉크 58.3% · 서하 47.9% · 린 47.5% · 도윤 43.0% → **유나가 도윤보다 약 16% 크다.**
 *
 * 잉크는 넓이라 길이 비율은 √ 다. 목표 잉크를 나머지 셋의 평균으로 잡고 √(목표/지금) 만큼 줄인다.
 * 칸은 512×512 그대로 두고, **발밑을 바닥에 맞춰** 아래 가운데에 앉힌다(앱이 그렇게 세운다).
 *
 * **도트는 정수배로만 깨끗하다.** 0.89 배는 정수배가 아니라 픽셀이 뭉갤 수 있다 —
 * 그래서 `nearest` 로 줄이고(흐려지지 않게), **결과를 사장님이 눈으로 보게** 비교 그림을 만든다.
 * 자가 통과해도 눈이 아니라고 하면 아닌 것이다(09-28 에 내 자가 열세 번 틀렸다).
 *
 * 되돌리기: 바탕화면 `두근도트-백업-<날짜>` 에 옛 그림과 `_표.json` 이 있다.
 */
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();

const slug = process.argv[2] ?? "yuna";
const 올림 = process.argv.includes("--올림");

const 잉크비 = async (buf: Buffer) => {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let n = 0;
  for (let p = 3; p < data.length; p += info.channels) if (data[p] > 127) n++;
  return n / (info.width * info.height);
};

// ── 모든 인물의 지금 잉크를 잰다 ──
const { data: chars, error } = await db.from("dot_characters").select("slug, name, sprites").neq("slug", "test-plumbing");
if (error) { console.error("표를 못 읽었다 — 멈춘다:", error.message); process.exit(1); }
const 인물 = (chars ?? []) as { slug: string; name: string; sprites: Record<string, string> | null }[];
const 잉크 = new Map<string, number>();
for (const c of 인물) {
  const urls = Object.values(c.sprites ?? {});
  let 합 = 0, n = 0;
  for (const u of urls) {
    try { 합 += await 잉크비(Buffer.from(await (await fetch(u)).arrayBuffer())); n++; } catch { /* 한 장 못 받는 것은 넘긴다 */ }
  }
  if (n) 잉크.set(c.slug, 합 / n);
}
const 나 = 잉크.get(slug);
const 남 = [...잉크.entries()].filter(([s]) => s !== slug).map(([, v]) => v);
if (나 === undefined || !남.length) { console.error("잉크를 못 쟀다 — 멈춘다"); process.exit(1); }
const 목표 = 남.reduce((a, b) => a + b, 0) / 남.length;
const 배율 = Math.sqrt(목표 / 나);
console.log(`${slug} 잉크 ${(나 * 100).toFixed(1)}% · 나머지 평균 ${(목표 * 100).toFixed(1)}% → **길이 ${배율.toFixed(3)}배**`);
if (Math.abs(1 - 배율) < 0.04) { console.log("차이가 4% 미만이다 — 건드리지 않는다."); process.exit(0); }

// ── 백업에서 읽어 줄인다(앱에서 다시 받지 않는다 — 백업이 원본이다) ──
const 백업 = `C:/Users/az518/Desktop/두근도트-백업-2026-09-28b/${slug}`;
if (!existsSync(백업)) { console.error(`백업이 없다: ${백업} — 먼저 dot_backup.mts 를 돌린다`); process.exit(1); }
const out = `C:/Users/az518/Desktop/도트-${slug}-크기맞춤`;
mkdirSync(`${out}/menhera`, { recursive: true });

const 감정 = ["neutral", "happy", "shy", "sad", "angry", "surprised"];
type 판 = { 키: string; 경로: string; png: Buffer; 잉크: number };
const 만든것: 판[] = [];
for (const [pre, dir] of [["", ""], ["menhera:", "menhera/"]] as const) {
  for (const e of 감정) {
    // 백업은 `:` 를 `-` 로 바꿔 평평하게 저장한다(윈도우가 `:` 를 못 쓴다).
    const src = pre ? `${백업}/menhera-${e}.png` : `${백업}/${e}.png`;
    if (!existsSync(src)) { console.log(`  없다 ${pre}${e}`); continue; }
    const 원 = sharp(readFileSync(src)).ensureAlpha();
    const { width: W = 512, height: H = 512 } = await 원.metadata();
    const 작게 = await 원.resize(Math.round(W * 배율), Math.round(H * 배율), { kernel: "nearest" }).toBuffer();
    const m = await sharp(작게).metadata();
    // 512 칸에 **아래 가운데**로 앉힌다 — 발밑이 바닥에 닿아야 표정을 바꿔도 안 튄다.
    const png = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: 작게, left: Math.round((W - (m.width ?? 0)) / 2), top: H - (m.height ?? 0) }])
      .png().toBuffer();
    const 경로 = `${out}/${dir}${e}.png`;
    writeFileSync(경로, png);
    만든것.push({ 키: `${pre}${e}`, 경로, png, 잉크: await 잉크비(png) });
  }
}
const 평균 = 만든것.reduce((s, r) => s + r.잉크, 0) / 만든것.length;
console.log(`만든 것 ${만든것.length}장 · 새 잉크 평균 ${(평균 * 100).toFixed(1)}% (목표 ${(목표 * 100).toFixed(1)}%)`);
console.log(`→ ${out}`);

if (!올림) { console.log("\n`--올림` 을 붙이면 저장소에 올리고 표를 바꾼다. 되돌리기는 백업 폴더의 _표.json."); process.exit(0); }

// ── 올린다 ──
const { data: 현재 } = await db.from("dot_characters").select("sprites").eq("slug", slug).maybeSingle();
const sprites = { ...(((현재 as { sprites?: Record<string, string> } | null)?.sprites) ?? {}) };
const 판번호 = Date.now().toString(36);
for (const r of 만든것) {
  const path = r.키.startsWith("menhera:") ? `${slug}/menhera/${r.키.slice(8)}.png` : `${slug}/${r.키}.png`;
  const { error: ue } = await db.storage.from("dot-sprites").upload(path, r.png, { contentType: "image/png", upsert: true });
  if (ue) { console.error(`올리기 실패 ${path}: ${ue.message}`); process.exit(1); }
  sprites[r.키] = `${db.storage.from("dot-sprites").getPublicUrl(path).data.publicUrl}?v=${판번호}`;
}
const { error: ue2 } = await db.from("dot_characters").update({ sprites }).eq("slug", slug);
if (ue2) { console.error(`표 바꾸기 실패: ${ue2.message}`); process.exit(1); }
console.log(`\n**올렸다** — ${만든것.length}장, 표도 바꿨다(캐시 깨는 ?v=${판번호}).`);
console.log("되돌리려면 백업 폴더의 _표.json 에 있는 주소를 다시 넣는다.");
