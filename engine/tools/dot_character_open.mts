/**
 * # 새 캐릭터를 **켠다**  (11-09)
 *
 *   npx tsx engine/tools/dot_character_open.mts taeo,jiwoo,soeun          ← 켜기 전에 본다
 *   npx tsx engine/tools/dot_character_open.mts taeo,jiwoo,soeun --on     ← 켠다
 *   npx tsx engine/tools/dot_character_open.mts taeo --off                ← 끈다(언제든)
 *
 * 켜기 전에 **갖춰야 할 것을 센다** — 스프라이트 6칸 · 얼굴 6개 · 사진 · 말투 사다리 · 인사.
 * 하나라도 비면 안 켠다. 반쪽으로 켜면 피드에 "사진 없음" 이 뜨고 말투가 엉뚱해진다.
 */
import { readFileSync, existsSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { VOICE_LADDERS } = await import("../../src/lib/dot/bond");
const { outlineShare, OUTLINE_MIN } = await import("../../src/lib/dot/outline");
const sharp = (await import("sharp")).default;
const { execFileSync } = await import("node:child_process");

/**
 * 도트 크기를 **잰다**. 폭으로 짐작하면 안 된다 — 옛 일곱도 새 셋도 다 512 인데
 * 한쪽은 1칸이 8화소, 한쪽은 2화소다(11-09 에 이걸로 틀릴 뻔했다).
 */
function 도트재기(paths: string[]): (number | null)[] {
  if (!paths.length) return [];
  const py = [
    "import sys, json",
    "sys.path.insert(0, 'engine/genesis')",
    "import texel_judge as T",
    `paths = ${JSON.stringify(paths)}`,
    "print(json.dumps([T.measure_one(p).get('texel') for p in paths]))",
  ].join(String.fromCharCode(10));
  return JSON.parse(execFileSync("python", ["-c", py], { encoding: "utf8", cwd: process.cwd() }).trim().split(String.fromCharCode(10)).pop()!);
}

const 이름들 = (process.argv[2] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
if (!이름들.length) { console.error("켤 사람을 적어 주세요: taeo,jiwoo,soeun"); process.exit(1); }
const 켤까 = process.argv.includes("--on");
const 끌까 = process.argv.includes("--off");
const EMO = ["neutral", "happy", "shy", "sad", "angry", "surprised"];
const db = createServiceClient();

const { data: chars } = await db.from("dot_characters").select("id, slug, name, sprites, faces, photos, voice_ladder, greeting, is_public").in("slug", 이름들);
let 막힘 = 0;
for (const c of (chars ?? []) as any[]) {
  const 빠진것: string[] = [];
  for (const e of EMO) {
    if (!existsSync(`public/dot-sprites/${c.slug}/${e}.png`)) 빠진것.push(`스프라이트 ${e}`);
    if (!existsSync(`public/dot-sprites/${c.slug}/face/${e}.png`)) 빠진것.push(`얼굴 ${e}`);
  }
  /* **흰 테두리** — 11-09 에 새 셋에만 빠졌다. 사람이 기억해야 하는 일은 또 빠지므로 문에 건다. */
  {
    const 길들 = EMO.map((e) => `public/dot-sprites/${c.slug}/${e}.png`).filter((p) => existsSync(p));
    const 도트 = 도트재기(길들.map((p) => p.split("\\").join("/")));
    for (const [i, p] of 길들.entries()) {
      const t = 도트[i];
      if (!t) { 빠진것.push(`도트를 못 잼 ${p.split("/").pop()}`); break; }
      const r = await outlineShare(readFileSync(p), t);
      if (r.비율 < OUTLINE_MIN) { 빠진것.push(`테두리 ${p.split("/").pop()}(도트 ${t} · ${(r.비율 * 100).toFixed(0)}%)`); break; }
    }
  }
  const 사진 = (c.photos ?? []) as { url: string }[];
  if (사진.length < 4) 빠진것.push(`사진 ${사진.length}장(4장 이상)`);
  if (!(VOICE_LADDERS as readonly string[]).includes(c.voice_ladder ?? "")) 빠진것.push("말투 사다리");
  if (!c.greeting) 빠진것.push("첫 인사");
  /* 주소는 **두드려 본다** — 적힌 것과 열리는 것은 다르다. */
  let 안열림 = 0;
  for (const p of 사진.slice(0, 3)) { const r = await fetch(p.url).catch(() => null); if (!r || !r.ok) 안열림++; }
  console.log(`${c.name}(${c.slug}) — 사진 ${사진.length}장 · 못 연 사진 ${안열림}개${빠진것.length ? ` · 빠진 것: ${빠진것.join(", ")}` : " · 다 갖췄다"}`);
  if (빠진것.length) { 막힘++; continue; }
  if (안열림 === 사진.slice(0, 3).length && 사진.length) console.log(`   (아직 배포 전이라 사진 주소가 안 열린다 — 배포 뒤에 열린다)`);
  if (켤까 || 끌까) {
    const { error } = await db.from("dot_characters").update({ is_public: 켤까 }).eq("id", c.id);
    console.log(error ? `   ✗ ${error.message}` : `   ${켤까 ? "켰다" : "껐다"}`);
  }
}
if (!켤까 && !끌까) console.log(`\n보기만 했다. 켜려면 --on`);
if (막힘) { console.log(`\n${막힘}명은 빠진 것이 있어 안 켰다.`); process.exit(1); }
