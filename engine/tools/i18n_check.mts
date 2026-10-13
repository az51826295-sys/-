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
const direct: string[] = [];
const used = new Map<string, string>(); // 원문 → 처음 쓰인 파일
const DICTS: Record<string, Record<string, { en: string; ja: string }>> = { dot: DOT, rookery: ROOKERY, common: COMMON };
/** 파일이 실제로 import 한 사전만 합친다. 다른 사전에만 있는 말은 그 화면에서 한국어로 나간다. */
const dictOf = (src: string) => Object.assign({}, ...[...src.matchAll(/i18n\/dict\/(dot|rookery|common)"/g)].map((m) => DICTS[m[1]]));
const perFile: { ko: string; f: string; dict: Record<string, { en: string; ja: string }> }[] = [];
// t("…") / t('…') / t(`…`) — 첫 인자가 글자 그대로인 것만. 변수로 넘긴 것은 못 센다(그런 곳은 사전 열쇠를 직접 쓴다).
const CALL = /\bt\(\s*(["'`])((?:\\.|(?!\1).)*?)\1/g;
for (const f of files) {
  if (f.includes("/i18n/")) continue;
  const s = readFileSync(f, "utf8");
  const fileDict = dictOf(s);
  for (const m of s.matchAll(CALL)) {
    const ko = m[2].replace(/\\n/g, "\n").replace(/\\(["'`])/g, "$1");
    if (!/[가-힣]/.test(ko)) continue;
    if (!used.has(ko)) used.set(ko, relative(ROOT, f));
    perFile.push({ ko, f: relative(ROOT, f), dict: fileDict });
  }
  // t 를 거치지 않고 (await getT(X))("…") 처럼 바로 부르면 위에서 못 센다 — 아예 못 쓰게 실패로 친다.
  if (/\)\)\(\s*["'`]/.test(s.replace(/\/\/.*$/gm, ""))) direct.push(relative(ROOT, f));
}

const slots = (s: string) => [...s.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]).sort().join(",");
const missing: string[] = [], empty: string[] = [], badSlots: string[] = [];
const reported = new Set<string>();
for (const { ko, f, dict } of perFile) {
  const d = dict[ko];
  if (!d) { const k = `${f}: ${JSON.stringify(ko)}`; if (!reported.has(k)) { reported.add(k); missing.push(k); } continue; }
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
  // 한국어 원본을 통째로 둔 함수(법률 문서 등 KoBody)는 원래 한국어라 세지 않는다.
  let inKo = false;
  code.forEach((line, i) => {
    if (/function KoBody\(/.test(raw[i])) inKo = true;
    if (inKo) { if (/^}/.test(raw[i])) inKo = false; return; }
    if (raw[i].includes("i18n-skip") || raw[i - 1]?.includes("i18n-skip-next")) return;
    if (/console\.(log|warn|error)/.test(line)) return;
    const noT = line.replace(CALL, "");
    // 화면에 나가는 한국어만 센다: 따옴표 안의 글, JSX 글(>…<), 글만 있는 줄. 한국어로 지은 변수·함수 이름은 안 센다.
    // 따옴표 안이라도 그 글이 사전 열쇠면(자료표의 이름처럼 t(변수) 로 옮기는 것) 이미 옮긴 것으로 친다.
    const lits = [...noT.matchAll(/(["'`])((?:\\.|(?!\1).)*?)\1/g)].map((m) => m[2]).filter((x) => /[가-힣]/.test(x) && !(x in ALL));
    const jsx = /[>}][^<>{}"'`]*[가-힣][^<>{}"'`]*[<{]/.test(noT) || /^\s*[가-힣][^=();{}<>"'`]*$/.test(noT);
    if (lits.length || jsx) left.push(`${i + 1}: ${raw[i].trim().slice(0, 110)}`);
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
for (const f of direct) missing.push(`${f}: (await getT(…))("…") 처럼 바로 부른 곳 — const t = … 로 받아서 t("…") 로 쓴다`);
const bad = missing.length + empty.length + badSlots.length;
console.log(bad ? `\n실패 ${bad}` : "\n번역 검사 통과");
process.exit(bad ? 1 : 0);
