/**
 * **전세계화 한 번에 올리기** (10-15, 사장님 "니가 다해줘").
 *
 * 영어·일본어 작업(GitHub `az51826295-sys/-` 의 `i18n/en-ja` 가지, 안에 두근도트 안전 문지기 포함)을
 * 사장님 컴퓨터의 로키 저장소에 얹고 → 검사 → 커밋·푸시 → DB 칸 더하기 → 캐릭터·게시물 번역 채우기 →
 * 문(deploy_safe)을 지나 dot-web · rookery-worker · rookery-web 에 올리고 → 실제 화면을 영어·일본어로 재 본다.
 *
 * 그 가지는 클라우드에서 10-13 스냅숏(`wip/0908-0918`, 01ee78e) 위에 만들었다. 사장님 저장소와 역사가
 * 이어져 있지 않으므로 **합치지 않고 차이만 옮긴다**(스냅숏 → i18n 차이를 3-way 로 얹음). 그 뒤에
 * 사장님이 고친 것이 있어도 겹치지 않으면 그대로 붙고, 겹치면 **여기서 멈춘다**(아무것도 안 올림).
 *
 * 사장님 컴퓨터, 로키 저장소 폴더에서 (PowerShell 이든 cmd 든):
 *
 *   git fetch https://github.com/az51826295-sys/- i18n/en-ja
 *   git checkout FETCH_HEAD -- engine/tools/world_ship.mts
 *   npx tsx engine/tools/world_ship.mts
 *
 * 다시 돌려도 된다 — 이미 끝난 칸은 건너뛴다(얹기·DB 칸·번역 모두).
 *   --rehearse   얹고 검사·커밋까지만(DB·배포 안 함)
 *   --no-deploy  DB·번역까지만(배포 안 함)
 *
 * 쓰는 돈: 번역 채우기에서 싼 모델 약 64번(캐릭터 4 + 게시물 60). 그 밖에는 0.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";

const SRC = "https://github.com/az51826295-sys/-";
const SELF = "engine/tools/world_ship.mts";
const REHEARSE = process.argv.includes("--rehearse");
const NO_DEPLOY = REHEARSE || process.argv.includes("--no-deploy");
const t0 = Date.now();
const 시각 = () => new Date().toLocaleTimeString("ko-KR", { hour12: false, timeZone: "Asia/Seoul" });
const 경과 = () => `${Math.round((Date.now() - t0) / 60000)}분 경과`;
const 칸 = (s: string) => console.log(`\n━━ ${시각()} · ${s} (${경과()})`);
const 멈춤 = (why: string, 할일?: string): never => {
  console.log(`\n■ 멈춤: ${why}`);
  if (할일) console.log(`  ${할일}`);
  console.log("  (이 화면 그대로 Claude 에게 보내 주시면 이어서 고칩니다.)");
  process.exit(1);
};
const git = (a: string[], quiet = false) =>
  execFileSync("git", a, { encoding: "utf8", stdio: ["ignore", "pipe", quiet ? "ignore" : "pipe"], maxBuffer: 64 << 20 }).trim();
/** tsx 를 셸 없이 부른다 — 셸을 거치면 윈도우에서 한글 인자(--뒤처져도)가 깨질 수 있다. */
const TSX = resolve("node_modules/tsx/dist/cli.mjs");
const tsx = (args: string[]) => spawnSync(process.execPath, [TSX, ...args], { stdio: "inherit" }).status ?? 1;
const envLocal = (): Record<string, string> => {
  const o: Record<string, string> = {};
  if (!existsSync(".env.local")) return o;
  for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const i = l.indexOf("=");
    if (i > 0 && !l.startsWith("#")) o[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
  return o;
};

// ── 0. 자리 확인 ─────────────────────────────────────────────────
칸("0. 자리 확인");
if (!existsSync("package.json") || !existsSync("src/lib/dot")) 멈춤("로키 저장소 폴더가 아니다.", "로키 저장소(railway up 하던 폴더)에서 다시 돌려 주세요.");
if (!existsSync(TSX)) 멈춤("node_modules 가 없다.", "npm install 먼저.");
const dirty = git(["status", "--porcelain"]).split(/\r?\n/).filter((l) => l && !l.endsWith(SELF) && !l.startsWith("??"));
const 이미얹음 = existsSync("src/lib/i18n/core.ts") && existsSync("src/lib/dot/i18n.ts");
if (dirty.length && !이미얹음) 멈춤(`커밋 안 된 변경 ${dirty.length}개가 있다 — 섞이지 않게 먼저 커밋해 주세요.`, dirty.slice(0, 8).join("\n  "));
console.log(`  저장소 ${resolve(".")} · 가지 ${git(["rev-parse", "--abbrev-ref", "HEAD"])} · HEAD ${git(["rev-parse", "--short", "HEAD"])}`);

// ── 1. 얹기 ──────────────────────────────────────────────────────
칸("1. 영어·일본어 작업 얹기");
if (이미얹음) console.log("  이미 얹혀 있다(src/lib/i18n/core.ts 있음) — 건너뜀");
else {
  git(["fetch", "--no-tags", SRC, "+refs/heads/wip/0908-0918:refs/world/base", "+refs/heads/i18n/en-ja:refs/world/head"]);
  const base = git(["rev-parse", "refs/world/base"]), head = git(["rev-parse", "refs/world/head"]);
  console.log(`  기준 ${base.slice(0, 7)}(10-13 스냅숏) → 작업 ${head.slice(0, 7)}: ${git(["diff", "--shortstat", base, head])}`);
  git(["reset", "-q", "--", SELF], true);                          // 위에서 꺼낸 이 파일은 커밋 때 같이 넣는다
  const patch = execFileSync("git", ["diff", "--binary", base, head, "--", ".", `:(exclude)${SELF}`], { maxBuffer: 256 << 20 });
  const ap = spawnSync("git", ["apply", "--3way", "--index", "--whitespace=nowarn", "-"], { input: patch, encoding: "utf8" });
  if (ap.status !== 0) {
    console.log(String(ap.stderr).split(/\r?\n/).filter(Boolean).slice(0, 30).join("\n"));
    const 겹침 = git(["diff", "--name-only", "--diff-filter=U"]);
    멈춤(`얹다가 겹치는 곳이 생겼다${겹침 ? `:\n  ${겹침.split(/\r?\n/).join("\n  ")}` : ""}`,
      "아무것도 커밋·배포하지 않았다. 되돌리려면: git reset --hard HEAD");
  }
  git(["add", "--", SELF]);
  console.log(`  얹음 · 바뀐 파일 ${git(["diff", "--cached", "--name-only"]).split(/\r?\n/).filter(Boolean).length}개`);
}

// ── 2. 검사(돈 0) ────────────────────────────────────────────────
칸("2. 검사 — 번역 빠짐 · 위기 문지기 · 말 판별 · 타입");
for (const f of ["i18n_check", "dot_safety_test", "dot_i18n_test", "dot_memo_test", "question_guard_probe", "rookery_lang_words_probe"]) {
  process.stdout.write(`  · ${f}\n`);
  if (tsx([`engine/tools/${f}.mts`]) !== 0) 멈춤(`${f} 가 떨어졌다.`, "커밋하지 않았다. 되돌리려면: git reset --hard HEAD");
}
{
  const tc = spawnSync("npx", ["tsc", "--noEmit", "-p", "."], { encoding: "utf8", shell: true, timeout: 600_000 });
  if (tc.status !== 0) 멈춤(`타입 검사 떨어짐:\n  ${String(tc.stdout || tc.stderr).split(/\r?\n/).filter(Boolean).slice(0, 12).join("\n  ")}`,
    "커밋하지 않았다. 되돌리려면: git reset --hard HEAD");
  console.log("  · 타입 검사 통과");
}

// ── 3. 커밋·푸시 ─────────────────────────────────────────────────
칸("3. 커밋·푸시");
if (git(["diff", "--cached", "--name-only"])) {
  git(["commit", "-q", "-m", "전세계화: 두근도트·로키·잿빛원정대 영어·일본어 + 두근도트 위기 문지기\n\n" +
    "클라우드 가지 az51826295-sys/- i18n/en-ja 를 10-13 스냅숏 기준 차이로 얹음(engine/tools/world_ship.mts).\n\n" +
    "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01NgBiTGX3RAr4o7z22MEbeJ"]);
  console.log(`  커밋 ${git(["rev-parse", "--short", "HEAD"])}`);
} else console.log("  커밋할 것 없음(이미 커밋됨)");
{
  const p = spawnSync("git", ["push"], { encoding: "utf8" });
  console.log(p.status === 0 ? "  푸시함" : `  ⚠ 푸시 실패(배포는 계속한다 — 나중에 git push): ${String(p.stderr).trim().split(/\r?\n/).pop()}`);
}
if (REHEARSE) { console.log(`\n시험 끝(--rehearse) — DB·배포는 안 했다. ${경과()}`); process.exit(0); }

// ── 4. DB 칸 더하기(두근도트 DB) ─────────────────────────────────
칸("4. 두근도트 DB 에 다국어 칸 더하기");
const env = envLocal();
for (const [k, v] of Object.entries(env)) process.env[k] ??= v;
const ref = /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(env.NEXT_PUBLIC_SUPABASE_URL ?? "")?.[1];
if (!ref) 멈춤(".env.local 에서 두근도트 Supabase 주소를 못 읽었다.");
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const 칸있나 = async () => {
  const a = await db.from("dot_characters").select("i18n").limit(1);
  const b = await db.from("dot_posts").select("i18n").limit(1);
  const c = await db.from("dot_push_subs").select("lang, tz").limit(1);
  return !a.error && !b.error && !c.error;
};
// 주석(한글)을 빼면 순수 ASCII — 클립보드에 넣어도 안 깨진다
const SQL = readFileSync("supabase/schema_dot_i18n.sql", "utf8").split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("--")).join("\n");
if (await 칸있나()) console.log("  이미 있다 — 건너뜀");
else {
  const pat = env.SUPABASE_PAT || env.SUPABASE_ACCESS_TOKEN;
  if (pat) {
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST", headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: SQL }),
    });
    console.log(r.ok ? "  관리 열쇠(SUPABASE_PAT)로 돌림" : `  관리 열쇠로 못 돌림(${r.status}) — 손으로 돌리는 길로 간다`);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  for (let i = 0; !(await 칸있나()); i++) {
    if (i >= 5) 멈춤("칸이 아직 없다.", "DB·배포 전 단계까지만 됐다. 코드는 칸이 없어도 돈다(한국어로 보일 뿐).");
    spawnSync("clip", { input: SQL });
    spawnSync("cmd", ["/c", "start", "", `https://supabase.com/dashboard/project/${ref}/sql/new`]);
    console.log("\n  ▶ 방금 열린 Supabase SQL 창에 **Ctrl+V → Run** 한 번만 눌러 주세요(넣을 글은 이미 복사해 뒀습니다):\n");
    console.log(SQL.split("\n").map((l) => `      ${l}`).join("\n"));
    await rl.question("\n  다 누르셨으면 Enter ");
  }
  rl.close();
  console.log("  칸 확인됨");
}

// ── 5. 캐릭터·게시물 번역 채우기 ─────────────────────────────────
칸("5. 캐릭터 이름·소개·첫인사, 게시물 한 줄 번역 채우기(이미 있는 건 건너뜀)");
if (tsx(["engine/tools/dot_i18n_fill.mts", "--write"]) !== 0) console.log("  ⚠ 번역 채우기가 실패로 끝났다 — 화면은 한국어 원래 글로 보인다(깨지지 않음). 배포는 계속한다.");
if (NO_DEPLOY) { console.log(`\n배포 없이 끝(--no-deploy). ${경과()}`); process.exit(0); }

// ── 6. 배포 — 문(deploy_safe)을 지나야만 ─────────────────────────
칸("6. 배포 (도는 일·미커밋·타입·죽은 서비스 문을 지나야 올라간다)");
const 결과: Record<string, string> = {};
const 올려 = (svc: string, extra: string[] = []) => {
  console.log(`\n  ▷ ${svc}`);
  const s = tsx(["engine/tools/rookery_env.mts", "engine/tools/deploy_safe.mts", svc, "--up", ...extra]);
  결과[svc] = s === 0 ? "올림·확인" : s === 2 ? "올렸으나 새 커밋 확인 못 함" : "안 올림(문에 걸림 또는 실패)";
  return s === 0;
};
올려("dot-web");                                    // 위기 문지기가 들어간 쪽이 먼저
const 워커 = 올려("rookery-worker");
// 개발 서비스(-dev)가 뒤처진 것은 알고 지나간다 — 본 서비스 워커를 먼저 올렸을 때만
올려("rookery-web", 워커 ? ["--뒤처져도"] : []);

// ── 7. 실제 화면 재기 ────────────────────────────────────────────
칸("7. 실제 화면을 영어·일본어로 재기(한글이 몇 자 남나)");
const 재기 = async (url: string, lang: string) => {
  try {
    const r = await fetch(url, { headers: { Cookie: `lang=${lang}`, "Accept-Language": lang }, cache: "no-store" });
    const body = (await r.text()).replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ");
    const n = (body.match(/[가-힣]/g) ?? []).length;
    console.log(`  ${r.status} ${lang} 한글 ${n}자 · ${url}`);
  } catch (e) { console.log(`  못 잼 ${url}: ${e instanceof Error ? e.message : e}`); }
};
for (const lang of ["en", "ja"]) {
  await 재기("https://dot-web-production-7e03.up.railway.app/dot/privacy", lang);
  await 재기("https://dot-web-production-7e03.up.railway.app/login", lang);
  await 재기("https://rookery-web-production.up.railway.app/pricing", lang);
}

console.log(`\n━━ 끝 ${시각()} (${경과()})`);
for (const [k, v] of Object.entries(결과)) console.log(`  ${k}: ${v}`);
console.log("  못 잰 것: 로그인해야 보이는 화면(채팅·피드), 캐릭터의 실제 영어·일본어 답, 잿빛원정대(글이 브라우저에서 바뀌어 여기선 못 잼).");
