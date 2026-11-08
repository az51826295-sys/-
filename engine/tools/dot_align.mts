/**
 * **일곱을 같은 바닥선에 세운다** — 11-08 사장님: *"하나로 정해 쿼리티를 일정하게"*.
 *
 *   npx tsx engine/tools/dot_align.mts            ← 재 보기만(아무것도 안 바꾼다)
 *   npx tsx engine/tools/dot_align.mts --up       ← 저장소에 올린다(같은 주소에 덮어쓴다)
 *   npx tsx engine/tools/dot_align.mts --backup <폴더>   ← 올리기 전 원본을 받아 둔다
 *
 * ## 이 도구가 **지켜야 하는 것**
 *
 * 자리만 옮기고 **그림은 한 점도 바꾸지 않는다.** 그래서 옮긴 뒤에 셋을 견준다:
 *   · 잉크 칸 수가 **똑같아야** 한다 — 달라지면 뭔가 잘려 나간 것이다
 *   · 도트 크기가 **똑같아야** 한다 — 달라지면 격자가 밀린 것이다
 *   · 순도가 **똑같아야** 한다 — 달라지면 픽셀을 다시 섞은 것이다
 * 하나라도 달라지면 **올리지 않고 멈춘다.** 이 검사가 이 도구의 사보타주다 — 심은 고장을
 * 따로 만들 필요가 없다. 옮기는 일 자체가 깨지면 바로 걸린다.
 *
 * ## 크기는 안 맞춘다
 *
 * 비정수 배율로 늘리면 도트 격자가 깨진다(`align.ts` 참조). 크기 퍼짐은 **재서 적기만** 하고,
 * 맞추는 일은 다시 뽑는 판으로 넘긴다.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { alignSprite, FOOT_MARGIN } = await import("../../src/lib/dot/align");
const { createClient } = await import("@supabase/supabase-js");
const sharp = (await import("sharp")).default;

const 올릴까 = process.argv.includes("--up");
const 받아둘곳 = process.argv[process.argv.indexOf("--backup") + 1];
const 받아두나 = process.argv.includes("--backup") && !!받아둘곳 && !받아둘곳.startsWith("--");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Row = { slug: string; name: string; sprites: Record<string, string> | null; is_public: boolean | null };
const { data, error } = await db.from("dot_characters").select("slug, name, sprites, is_public");
if (error) { console.error("표를 못 읽었다:", error.message); process.exit(1); }
const 사람 = (data as Row[]).filter((c) => c.is_public && c.sprites).sort((a, b) => a.slug.localeCompare(b.slug));

const 전신인가 = (k: string) => !k.startsWith("face") && !k.includes(":") && !k.startsWith("sticker");
const 터 = join(process.env.TEMP ?? ".", `dot-align-${Date.now()}`);
mkdirSync(터, { recursive: true });
if (받아두나) mkdirSync(받아둘곳!, { recursive: true });

/** 파이썬 자에게 도트 크기·순도를 묻는다(그림을 바꾸지 않았는지 보는 용도). */
function 도트재기(paths: string[]): { texel: number | null; purity: number | null }[] {
  const py = [
    "import sys, json",
    "sys.path.insert(0, 'engine/genesis')",
    "import texel_judge as T",
    `paths = ${JSON.stringify(paths.map((p) => p.replace(/\\/g, "/")))}`,
    "out = [T.measure_one(p) for p in paths]",
    "print(json.dumps([{ 'texel': o.get('texel'), 'purity': o.get('purity') } for o in out]))",
  ].join("\n");
  const 글 = execFileSync("python", ["-c", py], { encoding: "utf8", cwd: process.cwd() }).trim();
  return JSON.parse(글.split("\n").pop()!);
}

async function 잉크(png: Buffer) {
  const { data: raw, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let n = 0; for (let i = 3; i < raw.length; i += info.channels) if (raw[i] > 16) n++;
  return n;
}

type 한장 = { slug: string; name: string; emotion: string; 전: Buffer; 후: Buffer; 전길: string; 후길: string; 보고: Awaited<ReturnType<typeof alignSprite>>["report"] };
const 장들: 한장[] = [];

try {
  for (const c of 사람) {
    const keys = Object.keys(c.sprites!).filter(전신인가);
    const dir = join(터, c.slug); mkdirSync(dir, { recursive: true });
    for (const k of keys) {
      const res = await fetch(c.sprites![k]);
      if (!res.ok) { console.log(`못 받음  ${c.name} ${k} (${res.status})`); continue; }
      const 전 = Buffer.from(await res.arrayBuffer());
      const { png: 후, report } = await alignSprite(전);
      const 전길 = join(dir, `${k}-before.png`), 후길 = join(dir, `${k}-after.png`);
      writeFileSync(전길, 전); writeFileSync(후길, 후);
      if (받아두나) { mkdirSync(join(받아둘곳!, c.slug), { recursive: true }); writeFileSync(join(받아둘곳!, c.slug, `${k}.png`), 전); }
      장들.push({ slug: c.slug, name: c.name, emotion: k, 전, 후, 전길, 후길, 보고: report });
    }
  }

  /* ── 그림이 안 바뀌었나 ── */
  const 전도트 = 도트재기(장들.map((x) => x.전길));
  const 후도트 = 도트재기(장들.map((x) => x.후길));
  const 깨진것: string[] = [];
  for (let i = 0; i < 장들.length; i++) {
    const x = 장들[i];
    const a = await 잉크(x.전), b = await 잉크(x.후);
    if (a !== b) 깨진것.push(`${x.name} ${x.emotion}: 잉크 ${a}→${b} (잘려 나갔다)`);
    if (전도트[i].texel !== 후도트[i].texel) 깨진것.push(`${x.name} ${x.emotion}: 도트 ${전도트[i].texel}→${후도트[i].texel} (격자가 밀렸다)`);
    const p0 = 전도트[i].purity ?? 0, p1 = 후도트[i].purity ?? 0;
    if (Math.abs(p0 - p1) > 0.0005) 깨진것.push(`${x.name} ${x.emotion}: 순도 ${p0.toFixed(3)}→${p1.toFixed(3)} (픽셀을 다시 섞었다)`);
  }

  /* ── 적기 ── */
  console.log(`\n== 바닥선 맞추기 (${장들.length}장 · 목표 발밑 ${FOOT_MARGIN}px)\n`);
  console.log("이름     장   발밑 전        옮김(세로/가로)     몸 너비×높이");
  for (const c of 사람) {
    const 내것 = 장들.filter((x) => x.slug === c.slug);
    if (!내것.length) continue;
    const 전여백 = [...new Set(내것.map((x) => x.보고.footBefore))].join("/");
    const dy = [...new Set(내것.map((x) => x.보고.dy))].join("/");
    const dx = [...new Set(내것.map((x) => x.보고.dx))].join("/");
    const w = Math.round(내것.reduce((s, x) => s + x.보고.bodyW, 0) / 내것.length);
    const h = Math.round(내것.reduce((s, x) => s + x.보고.bodyH, 0) / 내것.length);
    const 잘림 = 내것.some((x) => x.보고.clamped) ? " ⚠잘릴까 봐 덜 옮김" : "";
    console.log(`${c.name.padEnd(7)} ${String(내것.length).padStart(2)}   ${전여백.padEnd(12)}  ${dy.padEnd(8)}/${dx.padEnd(8)}  ${w}×${h}${잘림}`);
  }

  const 몸높이 = 사람.map((c) => { const 내것 = 장들.filter((x) => x.slug === c.slug); return 내것.length ? 내것.reduce((s, x) => s + x.보고.bodyH, 0) / 내것.length : 0; }).filter((x) => x > 0);
  console.log(`\n   몸 높이 퍼짐 ${(Math.max(...몸높이) - Math.min(...몸높이)).toFixed(0)}px (${Math.min(...몸높이).toFixed(0)}~${Math.max(...몸높이).toFixed(0)}) — **이건 여기서 못 고친다**(다시 뽑는 판)`);

  if (깨진것.length) {
    console.log(`\n**그림이 바뀌었다 — 올리지 않는다** (${깨진것.length}건)`);
    for (const g of 깨진것.slice(0, 10)) console.log(`   ${g}`);
    process.exit(1);
  }
  console.log(`\n맞음   그림은 한 점도 안 바뀜 — 잉크·도트 크기·순도 ${장들.length}장 전부 그대로`);

  if (!올릴까) { console.log("\n(재 보기만 했다. 올리려면 --up)\n"); process.exit(0); }

  /* ── 올리기 ── */
  let 올린수 = 0;
  for (const x of 장들) {
    const path = `${x.slug}/${x.emotion}.png`;
    const { error: e } = await db.storage.from("dot-sprites").upload(path, x.후, { contentType: "image/png", upsert: true, cacheControl: "60" });
    if (e) { console.error(`${path}: ${e.message}`); process.exit(1); }
    올린수++;
  }
  console.log(`\n↑ ${올린수}장 올림 (같은 주소에 덮어씀 · cacheControl 60초)`);
} finally {
  try { rmSync(터, { recursive: true, force: true }); } catch { /* 지워지면 됐다 */ }
}
