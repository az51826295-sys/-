/**
 * **캐릭터 그림이 서로 일정한가** — 11-08 사장님: *"지금 캐릭터 퀄리티 안 좋고 일정하지도 않고"*.
 *
 *   npx tsx engine/tools/dot_art_consistency.mts
 *   npx tsx engine/tools/dot_art_consistency.mts --sabotage   ← 자가 눈이 있나
 *
 * ## 왜 또 자를 만드나 — 있던 자가 "일정함" 을 안 셌다
 *
 * `dot_audit_all` 은 캐릭터마다 ✅ 를 찍고 끝난다. 그런데 그 ✅ 아래 줄에 이렇게 적혀 있었다:
 *
 *     린·서하·유나  발밑 여백 0px      연우 16px      하루 24px      나비 32px
 *
 * **재 놓고 세지 않은 것이다**([[ruler-measured-but-never-counted]]). 캐릭터 하나씩 보면
 * 전부 맞지만, 일곱을 **나란히 두면** 바닥이 네 군데에 있다. 사장님이 "일정하지 않다" 고
 * 하신 것이 이 칸이다. 그래서 이 자는 **캐릭터끼리**만 본다.
 *
 * ## 재는 넷 (전부 결정적 셈 · 모델 0 · 값 0)
 *
 *  ① **도트 크기** — `texel_judge` 가 센다. 투구 16·몸 12 면 같은 세트로 안 보인다.
 *     격자가 뭉개져 자가 못 보는 장은 **못 잼**으로 따로 센다(통과로 안 민다).
 *  ② **도트 순도** — 한 칸이 한 색인 비율. 1.0 이 깨끗한 도트, 낮으면 안티에일리어싱이 섞인 것.
 *  ③ **발밑 여백** — 캔버스 아래에서 발까지 몇 px. 다르면 나란히 세웠을 때 **키가 떠 보인다**.
 *  ④ **잉크(차지하는 넓이)** — 화면에서 누가 더 커 보이나. `dot_audit_all` 이 이미 세던 칸이라
 *     여기서는 **퍼짐(최대-최소)** 만 적는다.
 *
 * 문턱은 **지어내지 않는다.** ①②는 "전부 같아야 한다"가 바깥 기준이고(같은 세트의 정의),
 * ③④는 실측 퍼짐을 적되 **지금 값을 문턱으로 못 박지 않는다** — 사장님이 보고 정할 칸이다.
 *
 * ## 못 재는 것
 *
 * **"예쁜가" 는 안 본다.** 그건 사장님 눈이고 이 자의 일이 아니다. 이 자가 말할 수 있는 것은
 * "일곱이 서로 다르다/같다" 까지다. 그림체·선·색감의 좋고 나쁨은 재지 않는다.
 */
import { readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const 심기 = process.argv.includes("--sabotage");

for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Row = { slug: string; name: string; sprites: Record<string, string> | null; is_public: boolean | null };
const { data, error } = await db.from("dot_characters").select("slug, name, sprites, is_public");
if (error) { console.error("표를 못 읽었다:", error.message); process.exit(1); }
const 사람 = (data as Row[]).filter((c) => c.is_public && c.sprites).sort((a, b) => a.slug.localeCompare(b.slug));

const 터 = join(process.env.TEMP ?? ".", `dot-art-${Date.now()}`);
mkdirSync(터, { recursive: true });

/** 전신만 본다 — 얼굴은 꽉 차게 자르는 것이 정상이라 발밑·잉크를 같은 자로 못 댄다(09-28). */
const 전신인가 = (k: string) => !k.startsWith("face") && !k.includes(":") && !k.startsWith("sticker");

type 잼 = { slug: string; name: string; 장: number; texel: (number | null)[]; purity: number[]; 발밑: number[]; 잉크: number[] };
const 잰것: 잼[] = [];

try {
  for (const c of 사람) {
    const keys = Object.keys(c.sprites!).filter(전신인가).slice(0, 6);
    if (!keys.length) continue;
    const dir = join(터, c.slug);
    mkdirSync(dir, { recursive: true });
    const paths: string[] = [];
    for (const k of keys) {
      const url = c.sprites![k];
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const p = join(dir, `${k.replace(/[^a-z0-9_-]/gi, "_")}.png`);
        writeFileSync(p, Buffer.from(await res.arrayBuffer()));
        paths.push(p);
      } catch { /* 못 받은 장은 빼고 센다 — 주소 깨짐은 dot_art_check 가 센다 */ }
    }
    if (!paths.length) continue;

    /* 도트 크기·순도는 파이썬 자가 센다. 사보타주는 **한 사람의 그림을 1.5배로 늘려** 격자를
       망가뜨린다 — 문턱만 흔드는 사보타주는 재는 쪽을 안 건드려서 눈이 있는지 못 본다. */
    const 망가뜨릴까 = 심기 && c.slug === 사람[0].slug;
    const py = [
      "import sys, json",
      "sys.path.insert(0, 'engine/genesis')",
      망가뜨릴까 ? "from PIL import Image" : "",
      "import texel_judge as T",
      `paths = ${JSON.stringify(paths.map((p) => p.replace(/\\/g, "/")))}`,
      망가뜨릴까
        ? "for p in paths:\n    im = Image.open(p); im.resize((int(im.width*1.5), int(im.height*1.5)), Image.BICUBIC).save(p)"
        : "",
      "out = [T.measure_one(p) for p in paths]",
      "print(json.dumps([{ 'texel': o.get('texel'), 'purity': o.get('purity') } for o in out]))",
    ].filter(Boolean).join("\n");
    const 글 = execFileSync("python", ["-c", py], { encoding: "utf8", cwd: process.cwd() }).trim();
    const 결 = JSON.parse(글.split("\n").pop()!) as { texel: number | null; purity: number | null }[];

    /* 발밑 여백·잉크는 여기서 센다 — 파이썬을 또 부를 일이 아니다. */
    const sharp = (await import("sharp")).default;
    const 발밑: number[] = []; const 잉크: number[] = [];
    for (const p of paths) {
      const { data: raw, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let 아래 = 0, 찬칸 = 0;
      const W = info.width, H = info.height, C = info.channels;
      let 바닥 = -1;
      for (let y = H - 1; y >= 0; y--) {
        let 있나 = false;
        for (let x = 0; x < W; x++) { if (raw[(y * W + x) * C + 3] > 16) { 있나 = true; 찬칸++; } }
        if (있나 && 바닥 < 0) 바닥 = y;
      }
      아래 = 바닥 < 0 ? -1 : H - 1 - 바닥;
      발밑.push(아래);
      잉크.push(Math.round((찬칸 / (W * H)) * 1000) / 10);
    }
    잰것.push({
      slug: c.slug, name: c.name, 장: paths.length,
      texel: 결.map((r) => r.texel ?? null),
      purity: 결.map((r) => r.purity ?? 0),
      발밑, 잉크,
    });
  }
} finally {
  try { rmSync(터, { recursive: true, force: true }); } catch { /* 지워지면 됐다 */ }
}

/* ── 적기 ── */
const 평 = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const 한값 = (a: (number | null)[]) => { const s = new Set(a.filter((x) => x !== null)); return s.size === 1 ? [...s][0] as number : null; };

console.log(`\n== 캐릭터끼리 (전신 ${잰것.reduce((s, c) => s + c.장, 0)}장 · 사람 ${잰것.length}명)\n`);
console.log("이름     장   도트크기        순도    발밑여백   잉크%");
for (const c of 잰것) {
  const t = 한값(c.texel);
  const 못잼 = c.texel.filter((x) => x === null).length;
  const 도트 = t !== null ? String(t) : (못잼 === c.texel.length ? "못 잼" : `섞임 ${[...new Set(c.texel)].join("/")}`);
  console.log(
    `${c.name.padEnd(7)} ${String(c.장).padStart(2)}   ${도트.padEnd(14)} ` +
    `${평(c.purity).toFixed(2)}   ${[...new Set(c.발밑)].join("/").padEnd(8)}  ${평(c.잉크).toFixed(1)}`,
  );
}

const 줄: [boolean, string][] = [];
const 도트들 = 잰것.map((c) => 한값(c.texel));
const 도트값 = [...new Set(도트들.filter((x): x is number => x !== null))];
const 도트못잼 = 도트들.filter((x) => x === null).length;
/* **못 잼은 통과가 아니다.** 사보타주를 돌렸더니 격자가 뭉개진 도윤이 "못 잼" 으로 빠지고
   남은 여섯이 전부 8 이라 ① 이 초록으로 나왔다 — 자가 **못 본 것을 괜찮다고 말한 것**이다
   ([[zero-can-mean-i-cannot-see]], 도트 자 자신의 규칙도 "blind 는 통과를 막는다"). */
줄.push([도트값.length <= 1 && 도트못잼 === 0,
  `① 도트 크기가 하나다: ${도트값.join("/") || "없음"}${도트못잼 ? ` · **못 잼 ${도트못잼}명**(격자가 뭉개져 자가 못 본다 — 통과 아님)` : ""}`]);

const 순도낮음 = 잰것.filter((c) => 평(c.purity) < 0.99);
줄.push([순도낮음.length === 0, `② 도트 순도 1.0: 낮은 사람 ${순도낮음.length}명${순도낮음.length ? ` (${순도낮음.map((c) => `${c.name} ${평(c.purity).toFixed(2)}`).join(" · ")})` : ""}`]);

const 발밑값 = [...new Set(잰것.flatMap((c) => c.발밑))].sort((a, b) => a - b);
줄.push([발밑값.length <= 1, `③ 발밑 여백이 하나다: ${발밑값.join("/")}px — ${발밑값.length}가지`]);

const 잉크평 = 잰것.map((c) => 평(c.잉크));
const 퍼짐 = Math.max(...잉크평) - Math.min(...잉크평);
console.log(`\n④ 잉크 퍼짐 ${퍼짐.toFixed(1)}%p (제일 큼 ${잰것[잉크평.indexOf(Math.max(...잉크평))]?.name} ${Math.max(...잉크평).toFixed(1)}% · 제일 작음 ${잰것[잉크평.indexOf(Math.min(...잉크평))]?.name} ${Math.min(...잉크평).toFixed(1)}%)`);
console.log("   (문턱 없음 — 얼마나 같아야 하는지는 사장님이 정할 칸이다)\n");

for (const [ok, g] of 줄) console.log(`${ok ? "맞음  " : "어긋남"} ${g}`);
const 틀림 = 줄.filter(([ok]) => !ok).length;
console.log(틀림 ? `\n**어긋남 ${틀림}가지** — 같은 세트로 안 보이는 까닭이 여기 있다` : `\n**세 칸 다 같다**`);
