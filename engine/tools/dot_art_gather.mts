/**
 * **흩어진 캐릭터 그림을 앱으로 모은다** (10-28).
 *   npx tsx engine/tools/dot_art_gather.mts          ← 재기만 한다
 *   npx tsx engine/tools/dot_art_gather.mts --진짜   ← 내려받고 표를 고친다
 *
 * 10-28 에 `dot_art_check` 가 **공개 캐릭터 그림 36장이 404** 라고 했다. 까닭이 둘이었다:
 *
 * 1. **주소 순서가 뒤집혀 있었다** — 표는 `<슬러그>/face/menhera/sad.png` 를 가리키는데
 *    파일은 `<슬러그>/menhera/face/sad.png` 에 있다. 파일은 멀쩡했다.
 * 2. **옛 Supabase 에만 있었다** — 멘헤라 몸 그림과 도윤의 전부. 10-24 이사 때 안 따라왔다.
 *
 * 그래서 **한 자리로 모은다.** 앱 `public/dot-sprites/` 가 그 자리다([[dot-moved-to-own-org]]).
 * 옛 프로젝트는 막힌 조직에 있어서 언젠가 사라진다 — 거기서 나오는 그림은 빌려 쓰는 것이다.
 *
 * ## 자리 규칙 (옛 Supabase 와 같다)
 *
 *   몸     <슬러그>/<감정>.png            멘헤라 몸   <슬러그>/menhera/<감정>.png
 *   얼굴   <슬러그>/face/<감정>.png       멘헤라 얼굴 <슬러그>/menhera/face/<감정>.png
 *   사진   <슬러그>/photo/<번호>.png
 *
 * ## 규율
 *
 * - **이미 있는 파일은 안 건드린다.** 덮어쓰면 누가 손본 그림을 옛것으로 되돌린다.
 * - 어디서도 못 받은 그림은 **표를 안 고친다** — 고치면 깨진 주소를 새 주소로 바꾸는 것뿐이다.
 * - 받은 파일이 **PNG 인지 본다**(앞 8바이트). 오류 쪽글을 .png 로 저장하면 자가 200 을 본다.
 */
import { mkdir, writeFile, access } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const 진짜 = process.argv.includes("--진짜");
const vars = JSON.parse(readFileSync(process.env.SCRATCH + "/dotvars.json", "utf8")) as Record<string, string>;
const URL_ = vars.NEXT_PUBLIC_SUPABASE_URL;
const KEY = vars.SUPABASE_SECRET_KEY;
const H = { apikey: KEY, authorization: "Bearer " + KEY, "content-type": "application/json" };

const APP = "https://dot-web-production-7e03.up.railway.app/dot-sprites";
const OLD = "https://iohfypuwnnayzztkvgvs.supabase.co/storage/v1/object/public/dot-sprites";
const 뿌리 = "public/dot-sprites";

type 캐릭 = {
  slug: string; is_public: boolean;
  sprites: Record<string, string> | null;
  faces: Record<string, string> | null;
  photos: { url: string; caption?: string }[] | null;
};

/** 표의 열쇠(`menhera:sad`)를 제자리 경로로. */
function 몸자리(slug: string, k: string): string {
  const [a, b] = k.split(":");
  return b ? `${slug}/menhera/${b}.png` : `${slug}/${a}.png`;
}
function 얼굴자리(slug: string, k: string): string {
  const [a, b] = k.split(":");
  return b ? `${slug}/menhera/face/${b}.png` : `${slug}/face/${a}.png`;
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function 있나(p: string) {
  try { await access(p); return true; } catch { return false; }
}

/** 한 자리를 채운다. 돌려주는 것: 채워졌나. */
async function 채운다(자리: string, 원래주소: string): Promise<"있었음" | "받음" | "못받음"> {
  const 파일 = join(뿌리, 자리);
  if (await 있나(파일)) return "있었음";
  /* 받아 올 곳 세 군데를 **순서대로** 본다. 지금 표에 적힌 주소가 맞을 수도 있다. */
  for (const u of [`${OLD}/${자리}`, 원래주소, `${APP}/${자리}`]) {
    try {
      const r = await fetch(u);
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.subarray(0, 8).equals(PNG)) continue;   // 오류 쪽글은 그림이 아니다
      if (진짜) { await mkdir(dirname(파일), { recursive: true }); await writeFile(파일, buf); }
      return "받음";
    } catch { /* 다음 곳 */ }
  }
  return "못받음";
}

const r = await fetch(`${URL_}/rest/v1/dot_characters?select=slug,is_public,sprites,faces,photos`, { headers: H });
if (!r.ok) { console.error("표를 못 읽었다:", r.status); process.exit(2); }
const rows = (await r.json()) as 캐릭[];

let 총받음 = 0, 총있음 = 0, 총못받음 = 0, 고친캐릭 = 0;

for (const c of rows) {
  if (c.slug === "test-plumbing") continue;
  const 셈 = { 있었음: 0, 받음: 0, 못받음: 0 };
  const 새몸: Record<string, string> = {};
  const 새얼굴: Record<string, string> = {};
  const 새사진: { url: string; caption?: string }[] = [];
  const 못받은: string[] = [];

  for (const k in c.sprites ?? {}) {
    const 자리 = 몸자리(c.slug, k);
    const 결과 = await 채운다(자리, c.sprites![k]);
    셈[결과]++;
    새몸[k] = 결과 === "못받음" ? c.sprites![k] : `${APP}/${자리}`;
    if (결과 === "못받음") 못받은.push("몸:" + k);
  }
  for (const k in c.faces ?? {}) {
    const 자리 = 얼굴자리(c.slug, k);
    const 결과 = await 채운다(자리, c.faces![k]);
    셈[결과]++;
    새얼굴[k] = 결과 === "못받음" ? c.faces![k] : `${APP}/${자리}`;
    if (결과 === "못받음") 못받은.push("얼굴:" + k);
  }
  const ps = c.photos ?? [];
  for (let i = 0; i < ps.length; i++) {
    const 자리 = `${c.slug}/photo/${i + 1}.png`;
    const 결과 = await 채운다(자리, ps[i].url.split("?")[0]);
    셈[결과]++;
    새사진.push({ ...ps[i], url: 결과 === "못받음" ? ps[i].url : `${APP}/${자리}` });
    if (결과 === "못받음") 못받은.push("사진:" + (i + 1));
  }

  총있음 += 셈.있었음; 총받음 += 셈.받음; 총못받음 += 셈.못받음;
  console.log(`${c.slug.padEnd(8)} 있었음 ${String(셈.있었음).padStart(2)} · 받음 ${String(셈.받음).padStart(2)} · 못받음 ${String(셈.못받음).padStart(2)}`
    + (못받은.length ? `   ${못받은.slice(0, 6).join(", ")}` : ""));

  if (!진짜) continue;
  const up = await fetch(`${URL_}/rest/v1/dot_characters?slug=eq.${c.slug}`, {
    method: "PATCH", headers: { ...H, prefer: "return=minimal" },
    body: JSON.stringify({ sprites: 새몸, faces: 새얼굴, photos: 새사진 }),
  });
  if (!up.ok) console.error(`  **표를 못 고쳤다** ${up.status} ${(await up.text()).slice(0, 120)}`);
  else 고친캐릭++;
}

console.log(`\n있었음 ${총있음} · 받음 ${총받음} · **못받음 ${총못받음}**`);
console.log(진짜 ? `표 고친 캐릭터 ${고친캐릭}명` : "**재기만 했다.** 넣으려면 `--진짜`.");
