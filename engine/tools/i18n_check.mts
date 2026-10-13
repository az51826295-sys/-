/**
 * 다국어 검사 (10-13). 세 가지를 센다 — 빠진 번역이 조용히 한국어로 나가지 않게.
 *   1. 코드의 t("…") 원문이 사전에 있는가, 영어·일본어가 둘 다 채워져 있는가
 *   2. 원문과 번역의 {자리} 이름이 같은가 (다르면 숫자·이름이 안 들어간다)
 *   3. (참고) 화면 파일에 t() 로 안 감싼 한국어가 몇 줄 남았나 — 주석·모델 지시문은 뺀다
 * 1·2 가 하나라도 있으면 실패(종료 코드 1). 3 은 진행 상황이라 실패로 치지 않는다.
 *
 * 사용: npx tsx engine/tools/i18n_check.mts [--left]   (--left 면 남은 한국어 줄을 파일별로 다 보인다)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { DOT } from "../../src/lib/i18n/dict/dot";
import { ROOKERY } from "../../src/lib/i18n/dict/rookery";
import { COMMON } from "../../src/lib/i18n/dict/common";

const ROOT = join(import.meta.dirname, "../..");
const ALL = { ...COMMON, ...ROOKERY, ...DOT };
const showLeft = process.argv.includes("--left");

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}

const files = walk(join(ROOT, "src"));
const used = new Map<string, string>(); // 원문 → 처음 쓰인 파일
// t("…") / t('…') / t(`…`) — 첫 인자가 글자 그대로인 것만. 변수로 넘긴 것은 못 센다(그런 곳은 사전 열쇠를 직접 쓴다).
const CALL = /\bt\(\s*(["'`])((?:\\.|(?!\1).)*?)\1/g;
for (const f of files) {
  if (f.includes("/i18n/")) continue;
  const s = readFileSync(f, "utf8");
  for (const m of s.matchAll(CALL)) {
    const ko = m[2].replace(/\\n/g, "\n").replace(/\\(["'`])/g, "$1");
    if (/[가-힣]/.test(ko) && !used.has(ko)) used.set(ko, relative(ROOT, f));
  }
}

const slots = (s: string) => [...s.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]).sort().join(",");
const missing: string[] = [], empty: string[] = [], badSlots: string[] = [];
for (const [ko, f] of used) {
  const d = ALL[ko];
  if (!d) { missing.push(`${f}: ${JSON.stringify(ko)}`); continue; }
  if (!d.en?.trim() || !d.ja?.trim()) empty.push(`${f}: ${JSON.stringify(ko)}`);
  for (const lang of ["en", "ja"] as const) if (d[lang] && slots(d[lang]) !== slots(ko)) badSlots.push(`${lang} ${JSON.stringify(ko)} → ${JSON.stringify(d[lang])}`);
}
for (const [ko, d] of Object.entries(ALL)) {
  for (const lang of ["en", "ja"] as const) if (d[lang] && slots(d[lang]) !== slots(ko) && !used.has(ko)) badSlots.push(`${lang} ${JSON.stringify(ko)} → ${JSON.stringify(d[lang])}`);
}

// 3. 남은 한국어(참고). 주석과 `// i18n-skip` 이 붙은 줄(모델 지시문·로그 등)은 뺀다.
function stripComments(s: string) {
  return s.replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, " ")).replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}
const SCREEN = (f: string) => /src\/app\/(dot|ask|login|signup|pricing|terms|privacy|refund|delete-account|auth)\b|src\/app\/(page|layout)\.tsx|src\/app\/api\/(dot|auth|billing)|src\/components\//.test(relative(ROOT, f));
let leftTotal = 0;
const leftByFile: [string, string[]][] = [];
for (const f of files.filter(SCREEN)) {
  const raw = readFileSync(f, "utf8").split("\n");
  const code = stripComments(raw.join("\n")).split("\n");
  const left: string[] = [];
  code.forEach((line, i) => {
    if (raw[i].includes("i18n-skip") || raw[i - 1]?.includes("i18n-skip-next")) return;
    const noT = line.replace(CALL, "");
    if (/[가-힣]/.test(noT) && !/console\.(log|warn|error)/.test(line)) left.push(`${i + 1}: ${raw[i].trim().slice(0, 110)}`);
  });
  if (left.length) { leftByFile.push([relative(ROOT, f), left]); leftTotal += left.length; }
}

console.log(`t() 원문 ${used.size}개 · 사전 ${Object.keys(ALL).length}개`);
console.log(`사전에 없음 ${missing.length} · 번역 빈칸 ${empty.length} · 자리 이름 어긋남 ${badSlots.length}`);
for (const x of [...missing, ...empty, ...badSlots].slice(0, 40)) console.log("  ✗ " + x);
console.log(`\n(참고) 화면 파일에 남은 한국어 줄 ${leftTotal} — 파일 ${leftByFile.length}개`);
for (const [f, l] of leftByFile.sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${l.length.toString().padStart(4)}  ${f}`);
  if (showLeft) for (const x of l) console.log("        " + x);
}
const bad = missing.length + empty.length + badSlots.length;
console.log(bad ? `\n실패 ${bad}` : "\n번역 검사 통과");
process.exit(bad ? 1 : 0);
