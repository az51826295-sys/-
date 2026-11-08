/**
 * **안 쓰는 코드가 얼마나 불었나** — 11-08 사장님: *"바이브코딩 오래할 수록 안쓰는 코드 불어나지 않아?"*
 *
 *   npx tsx engine/tools/dead_code.mts
 *   npx tsx engine/tools/dead_code.mts --sabotage   ← 자가 눈이 있나
 *   npx tsx engine/tools/dead_code.mts --list       ← 파일 이름까지
 *
 * ## 왜 grep 으로는 안 되나
 *
 * "이 파일 이름이 어디 나오나" 를 grep 하면 **죽은 짝**을 못 본다. A 가 B 를 부르는데
 * A 를 아무도 안 부르면 B 도 죽은 것이다 — 그런데 grep 은 "B 는 A 가 쓰네" 하고 통과시킨다.
 * 그래서 이 자는 **입구에서 출발해 닿는 곳을 센다**(도달성). 닿지 않은 것이 죽은 것이다.
 *
 * 입구는 내가 고르는 것이 아니라 틀이 정한다:
 *   · Next 가 스스로 부르는 파일 — page/layout/route/middleware/error/sitemap...
 *   · `package.json` 의 scripts 가 부르는 파일
 *   · `engine/tools/*.mts` — 명령줄에서 사람이 직접 부르므로 전부 입구다
 * engine 도구가 `src/` 를 불러 쓰는 길도 따라간다(안 따라가면 멀쩡한 파일을 죽었다고 센다).
 *
 * ## 문턱
 *
 * **지어내지 않는다.** "죽은 코드 = 입구에서 닿지 않는 파일" 은 취향이 아니라 정의다.
 * 좋은 값은 0 이고, 지금 값은 아래에 적는다. 몇 개까지 봐 줄지는 내가 정할 칸이 아니다.
 *
 * ## 못 재는 것
 *
 *  · **도구 자체가 죽었는지**는 못 잰다 — 전부 입구라 도달성으로 판정이 안 된다.
 *    한 번 쓰고 버린 도구는 숫자만 적고 "못 잼" 으로 둔다([[zero-can-mean-i-cannot-see]]).
 *  · 문자열로 조립한 import(`import(ìˆ˜ì‹)`), 설정 파일에만 이름이 적힌 길.
 *    이런 길이 있으면 **살아 있는 것을 죽었다고 셀 수 있다** — 아래 '의심' 칸에 따로 적는다.
 */
import { readFileSync, writeFileSync, rmSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const 심기 = process.argv.includes("--sabotage");
const 목록 = process.argv.includes("--list");
const 뿌리 = process.cwd();

/* ── 파일 모으기 ── */
const 볼확장 = [".ts", ".tsx", ".mts", ".mjs", ".js", ".jsx"];
function 쓸기(dir: string, 담을곳: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next" || e.name === ".git") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) 쓸기(p, 담을곳);
    else if (볼확장.some((x) => e.name.endsWith(x))) 담을곳.push(정규(p));
  }
  return 담을곳;
}
const 정규 = (p: string) => relative(뿌리, resolve(p)).split("\\").join("/");

const src파일 = existsSync("src") ? 쓸기("src") : [];
const engine파일 = existsSync("engine") ? 쓸기("engine") : [];

/* ── 사보타주: 죽은 파일 하나 + 죽은 짝 하나를 심는다 ──
   짝(A→B)은 grep 식 자를 걸러낸다. B 는 "누군가 import 하니까" 통과하기 때문이다. */
const 심은것: string[] = [];
if (심기) {
  const a = "src/lib/dot/__probe_orphan_a.ts";
  const b = "src/lib/dot/__probe_orphan_b.ts";
  const c = "src/lib/dot/__probe_lonely.ts";
  writeFileSync(b, "export const probeB = 1;\n");
  writeFileSync(a, 'import { probeB } from "./__probe_orphan_b";\nexport const probeA = probeB;\n');
  writeFileSync(c, "export const probeC = 1;\n");
  심은것.push(a, b, c);
  for (const p of 심은것) if (!src파일.includes(p)) src파일.push(p);
}

const 모든파일 = [...src파일, ...engine파일];
const 있나 = new Set(모든파일);

/* ── import 길 읽기 ── */
const 길정규식 = [
  /\bfrom\s+["']([^"']+)["']/g,
  /\bimport\s+["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
];
/** 문자열을 조립해 부르는 import — 있으면 "살아 있는데 죽었다고 셀" 위험이 있다. */
const 수상한정규식 = /\bimport\s*\(\s*[^"')]/g;

const 끝붙임 = ["", ".ts", ".tsx", ".mts", ".mjs", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.mts"];
function 맞춰찾기(들어온곳: string, 적힌길: string): string | null {
  let 밑: string;
  if (적힌길.startsWith("@/")) 밑 = join("src", 적힌길.slice(2));
  else if (적힌길.startsWith(".")) 밑 = join(dirname(들어온곳), 적힌길);
  else return null; /* 패키지 */
  const n = 정규(밑);
  for (const e of 끝붙임) { const c = (n + e).split("\\").join("/"); if (있나.has(c)) return c; }
  return null;
}

const 나가는길 = new Map<string, string[]>();
const 수상한파일: string[] = [];
for (const f of 모든파일) {
  let 글 = "";
  try { 글 = readFileSync(f, "utf8"); } catch { continue; }
  const 모은것 = new Set<string>();
  for (const re of 길정규식) { re.lastIndex = 0; let m: RegExpExecArray | null;
    while ((m = re.exec(글))) { const t = 맞춰찾기(f, m[1]); if (t && t !== f) 모은것.add(t); } }
  나가는길.set(f, [...모은것]);
  수상한정규식.lastIndex = 0;
  if (수상한정규식.test(글)) 수상한파일.push(f);
}

/* ── 입구 ── */
const Next가부르는 = /^src\/(app|pages)\/.*\/?(page|layout|route|template|default|loading|error|global-error|not-found|sitemap|robots|manifest|icon|apple-icon|opengraph-image|twitter-image)\.(ts|tsx|js|jsx)$/;
const 입구 = new Set<string>();
for (const f of src파일) {
  if (Next가부르는.test(f)) 입구.add(f);
  if (/^src\/(middleware|instrumentation)\.(ts|tsx)$/.test(f)) 입구.add(f);
  if (/^src\/app\/(layout|page)\.tsx$/.test(f)) 입구.add(f);
}
/* engine 도구는 사람이 명령줄에서 직접 부른다 — 전부 입구다. */
const 도구 = engine파일.filter((f) => /^engine\/tools\/[^/]+\.(mts|ts|mjs)$/.test(f));
for (const f of 도구) 입구.add(f);
/* 워커·스크립트 — package.json 과 알려진 자리 */
for (const f of 모든파일) if (/^src\/worker\//.test(f) || /^scripts\//.test(f)) 입구.add(f);
try {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  for (const v of Object.values<string>(pkg.scripts ?? {})) {
    for (const m of String(v).matchAll(/[\w./-]+\.(?:mts|ts|mjs|js)/g)) { const n = 정규(m[0]); if (있나.has(n)) 입구.add(n); }
  }
} catch { /* 없으면 없는 대로 */ }

/* ── 도달성 ── */
const 닿음 = new Set<string>();
const 줄서기 = [...입구];
while (줄서기.length) {
  const f = 줄서기.pop()!;
  if (닿음.has(f)) continue;
  닿음.add(f);
  for (const t of 나가는길.get(f) ?? []) if (!닿음.has(t)) 줄서기.push(t);
}

const 죽은src = src파일.filter((f) => !닿음.has(f));
const 죽은engine = engine파일.filter((f) => !닿음.has(f) && !도구.includes(f));
const 줄수 = (f: string) => { try { return readFileSync(f, "utf8").split("\n").length; } catch { return 0; } };
const 죽은줄 = [...죽은src, ...죽은engine].reduce((s, f) => s + 줄수(f), 0);
const 산줄 = [...src파일, ...engine파일].reduce((s, f) => s + 줄수(f), 0);

/* ── 적기 ── */
console.log(`\n== 안 쓰는 코드 (파일 ${모든파일.length}개 · ${산줄.toLocaleString()}줄 · 입구 ${입구.size}개)\n`);
console.log(`   src     닿지 않는 파일 ${죽은src.length}개 / ${src파일.length}개`);
console.log(`   engine  닿지 않는 받침 파일 ${죽은engine.length}개 / ${(engine파일.length - 도구.length)}개`);
console.log(`   죽은 줄 ${죽은줄.toLocaleString()}줄 = 전체의 ${((죽은줄 / (산줄 || 1)) * 100).toFixed(1)}%\n`);

if (목록 || 심기) {
  for (const [이름, 들] of [["src", 죽은src], ["engine", 죽은engine]] as [string, string[]][]) {
    if (!들.length) continue;
    console.log(`-- ${이름}`);
    for (const f of 들.sort((a, b) => 줄수(b) - 줄수(a))) console.log(`   ${String(줄수(f)).padStart(5)}줄  ${f}`);
  }
  console.log("");
}

console.log(`   도구 ${도구.length}개는 **못 잼** — 전부 입구라 도달성으로 판정이 안 된다(한 번 쓰고 버린 것이 섞여 있다).`);
console.log(`   수상 ${수상한파일.length}개 — 문자열로 조립한 import 가 있어, 살아 있는데 죽었다고 셀 수 있는 자리다.\n`);

const 줄: [boolean, string][] = [];
줄.push([죽은src.length === 0, `① src 에 닿지 않는 파일이 없다: ${죽은src.length}개`]);
줄.push([죽은engine.length === 0, `② engine 받침에 닿지 않는 파일이 없다: ${죽은engine.length}개`]);
for (const [ok, g] of 줄) console.log(`${ok ? "맞음  " : "어긋남"} ${g}`);

if (심기) {
  const 잡음 = 심은것.filter((p) => 죽은src.includes(p));
  console.log(`\n-- 심은 고장: ${심은것.length}개 심고 ${잡음.length}개 잡음`);
  for (const p of 심은것) console.log(`   ${죽은src.includes(p) ? "잡음  " : "놓침  "} ${p}`);
  for (const p of 심은것) { try { rmSync(p); } catch { /* 지워지면 됐다 */ } }
  if (잡음.length !== 심은것.length) { console.log("\n**자가 눈이 없다** — 죽은 짝을 못 봤다."); process.exit(1); }
  console.log("\n자는 눈이 있다 — 죽은 짝(A→B, A 를 아무도 안 부름)까지 잡았다.");
}
