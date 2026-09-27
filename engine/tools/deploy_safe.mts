/**
 * **문을 지나야 올라간다** (226회차 09-26, 사장님 "로키는 자동화의 정석이 되어야 해").
 *
 * 자동 배포를 일부러 안 열어 뒀던 이유는 "한 번 잘못 올리면 20분 죽는다" 였다. 그런데 지난 사고
 * 기록을 읽어 보니 죽은 원인은 **자동이라서가 아니라 확인이 없어서**였다:
 *   - G15 09-07: 도는 일이 있는데 올려서 컨테이너가 갈리며 실행이 죽었다
 *   - AA4 09-16: 패치가 붙었는지 안 보고 올렸다(20분 공백)
 *   - 150 09-18: "도는 일 없음" 을 **찍기만 하고 안 막아서** 사장님 일이 도는 중에 워커를 올렸다
 *     → 그때 내가 적은 말: **"확인은 문이어야지 로그가 아니다."**
 *
 * 그 말을 그대로 코드로 옮긴다. 문 넷을 지나야 `railway up` 이 불리고, 올린 뒤에는 **새 커밋이
 * 실제로 도는지** 지켜본다(service_heartbeat). 안 돌면 사람에게 알린다 — 되돌리기는 아직 사람 손이다
 * (Railway 롤백을 한 번도 안 재 봤고, 안 재 본 되돌리기는 사고를 두 배로 만든다).
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/deploy_safe.mts <서비스>          # 문만 보고 멈춤
 *   npx tsx engine/tools/rookery_env.mts engine/tools/deploy_safe.mts <서비스> --up     # 실제로 올림
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createServiceClient } from "../../src/lib/supabase/service";

const svc = process.argv[2];
const UP = process.argv.includes("--up");
if (!svc) throw new Error("사용: deploy_safe.mts <서비스> [--up]");
const git = (a: string[]) => execFileSync("git", a, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const db = createServiceClient();
const fail: string[] = [];
const ok: string[] = [];

// ── 문 ① 도는 일이 있나 ───────────────────────────────────────────
// 배포는 컨테이너를 간다. 도는 실행은 그 자리에서 죽고 행은 running 으로 남는다(G15).
const { data: running, error: re } = await db
  .from("work_executions").select("id, created_at, company_id").eq("status", "running");
if (re) fail.push(`도는 일을 못 셌다: ${re.message}`);      // 못 세면 막는다 — 모르면 안 올린다
else if (running?.length) {
  for (const r of running as { id: string; created_at: string }[]) {
    const mins = Math.round((Date.now() - Date.parse(r.created_at)) / 60000);
    // 20분 넘게 안 움직인 실행은 이미 죽은 것으로 본다(폴링이 접는 기준과 같다)
    if (mins < 20) fail.push(`도는 일 ${r.id.slice(0, 8)} (${mins}분째) — 올리면 이 일이 죽는다`);
  }
  if (!fail.length) ok.push(`도는 일 ${running.length}건은 전부 20분 넘게 멈춰 있다(죽은 것으로 봄)`);
} else ok.push("도는 일 없음");

// ── 문 ② 커밋 안 된 변경 ──────────────────────────────────────────
// railway up 은 작업 트리를 올린다. 커밋 안 된 것이 있으면 **저장소에 없는 코드가 서버에서 돈다** —
// 나중에 "어느 커밋이 도는가" 를 물을 수 없게 된다.
const dirty = git(["status", "--porcelain"]).split("\n").filter((l) => l && !l.startsWith("??"));
if (dirty.length) fail.push(`커밋 안 된 변경 ${dirty.length}개 — 올리면 저장소에 없는 코드가 돈다\n    ${dirty.slice(0, 5).map((l) => l.trim()).join("\n    ")}`);
else ok.push(`작업 트리 깨끗 · HEAD ${git(["rev-parse", "--short", "HEAD"])} ${git(["log", "-1", "--format=%s"]).slice(0, 40)}`);

// ── 문 ③ 빌드가 서나 ─────────────────────────────────────────────
// 타입 검사에 떨어지는 코드를 올리면 빌드가 죽고 그동안 옛 컨테이너도 내려간다(164회차).
// **린트는 문이 아니다** — next.config.ts 에 eslint 설정이 없고, 지금 도는 서버도 린트에 걸린 줄을
// 안은 채 올라가 있다(DotChat.tsx). 빌드를 안 죽이는 것을 문으로 삼으면 영영 못 올린다. 보고만 한다.
{
  const t = spawnSync("npx", ["tsc", "--noEmit", "-p", "."], { encoding: "utf8", shell: true, timeout: 600_000 });
  if (t.status === 0) ok.push("타입 검사 통과");
  else fail.push(`타입 검사 떨어짐:\n    ${String(t.stdout || t.stderr).split("\n").filter(Boolean).slice(0, 4).join("\n    ")}`);
  const l = spawnSync("npx", ["eslint", "src", "--quiet"], { encoding: "utf8", shell: true, timeout: 600_000 });
  const bad = String(l.stdout).split("\n").filter((x) => /\berror\b/.test(x)).length;
  ok.push(l.status === 0 ? "린트 통과" : `린트에 걸린 줄 ${bad}건 — 막지는 않는다`);
}

// ── 문 ④ 그 서비스가 지금 살아 있나 ────────────────────────────────
// 이미 죽어 있는 서비스에 올리면 "내가 죽였나" 를 구분할 수 없다.
const { data: hb } = await db.from("service_heartbeat").select("commit_sha, seen_at").eq("service", svc).maybeSingle();
const beforeSha = (hb?.commit_sha as string | null) ?? null;
const beforeAge = hb ? Math.round((Date.now() - Date.parse(String(hb.seen_at))) / 60000) : null;
if (!hb) ok.push(`${svc} 는 아직 자기 커밋을 알린 적이 없다(첫 배포로 본다)`);
else if (beforeAge !== null && beforeAge > 10) fail.push(`${svc} 소식이 ${beforeAge}분 전이다 — 이미 내려가 있다. 먼저 왜 죽었는지 본다`);
else ok.push(`${svc} 살아 있음 · ${String(beforeSha).slice(0, 7)} · ${beforeAge}분 전`);

// ── 다른 서비스도 같이 본다 (226회차 09-26) ────────────────────
// 오늘 실제로 값을 태운 자리: 개발 계정에 넣은 영상 업무를 **rookery-worker-dev** 가 집는데, 나는 내내
// `rookery-worker` 만 올리고 "새 코드가 돈다" 를 확인했다. dev 는 커밋 7개 뒤진 채였고 음악 코드가 아예
// 없었다. 자는 초록인데 일은 옛 코드로 돌았다 — **"내가 올린 것" 이 아니라 "그 일을 집을 것" 을 물어야 한다.**
// 어느 서비스가 어느 일을 집는지는 코드가 모르니, 막지는 않고 **뒤진 것을 전부 적는다.**
const behindOthers: string[] = [];
{
  const head7 = git(["rev-parse", "--short", "HEAD"]);
  const { data: all } = await db.from("service_heartbeat").select("service, commit_sha, seen_at");
  for (const r of (all ?? []) as { service: string; commit_sha: string | null; seen_at: string }[]) {
    if (r.service === svc || !r.commit_sha) continue;
    const age = Math.round((Date.now() - Date.parse(r.seen_at)) / 60000);
    if (age > 30) continue;                                   // 안 도는 것은 여기서 따질 일이 아니다
    if (r.commit_sha.startsWith(head7) || head7.startsWith(r.commit_sha.slice(0, 7))) continue;
    let n = 0;
    try { n = Number(git(["rev-list", "--count", `${r.commit_sha}..HEAD`])); } catch { n = -1; }
    behindOthers.push(`${r.service} ${r.commit_sha.slice(0, 7)} — ${n < 0 ? "이 저장소에 없는 커밋" : `커밋 ${n}개 뒤`}`);
  }
}

// 226회차 09-27: **heartbeat 를 안 보내는 서비스는 위 목록에 아예 안 나온다.**
// 오늘 두 번 그 구멍에 빠졌다 — 결과를 대화에 붙이는 일을 rookery-web 이 하는데, 그건 자기 커밋을
// 안 알리므로 "뒤져 있다" 경고에 낄 수가 없다. 조각 이어달리기가 안 도는 원인을 워커에서만 찾았다.
// 못 재는 것은 **못 잰다고 적는다** — 조용한 것과 괜찮은 것은 다르다.
const SILENT = ["rookery-web", "rookery-web-dev"];
{
  const { data: hb2 } = await db.from("service_heartbeat").select("service");
  const known = new Set(((hb2 ?? []) as { service: string }[]).map((r) => r.service));
  const silent = SILENT.filter((s) => s !== svc && !known.has(s));
  if (silent.length) {
    console.log(`  ? **커밋을 안 알리는 서비스**: ${silent.join(", ")} — 새 코드인지 **못 잰다.**`);
    console.log(`      이 판의 일을 그쪽이 집는다면 따로 올릴 것: npx tsx engine/tools/rookery_env.mts engine/tools/deploy_safe.mts <이름> --up`);
  }
}

console.log(`\n=== 올리기 문: ${svc} ===`);
for (const l of ok) console.log(`  · ${l}`);
for (const l of fail) console.log(`  ≠ ${l}`);
if (behindOthers.length) {
  console.log(`\n  ! **다른 서비스가 뒤져 있다** — 그 일을 집는 쪽이 여기면 새 코드가 안 돈다:`);
  for (const l of behindOthers) console.log(`      ${l}`);
}
if (fail.length) { console.log(`\n**안 올린다** — 문 ${fail.length}개에 걸렸다.`); process.exit(1); }
if (!UP) { console.log("\n문 전부 통과. --up 을 붙이면 실제로 올린다."); process.exit(0); }

// ── 올린다 ───────────────────────────────────────────────────────
const sha = git(["rev-parse", "HEAD"]);
console.log(`\n${new Date().toISOString().slice(11, 19)} 올린다 — ${sha.slice(0, 7)} → ${svc}`);
spawnSync("railway", ["variables", "--service", svc, "--set", `ROOKERY_COMMIT=${sha}`], { stdio: "ignore", shell: true, timeout: 120_000 });
const up = spawnSync("railway", ["up", "--service", svc, "--ci"], { stdio: "inherit", shell: true, timeout: 1_800_000 });
if (up.status !== 0) { console.log(`\n**올리기 자체가 실패했다**(코드 ${up.status}) — 서버는 옛 코드 그대로다.`); process.exit(1); }

// ── 올린 뒤: 새 커밋이 **실제로 도는가** ──────────────────────────
// "올렸다" 와 "새 코드가 돈다" 는 다르다(09-22 사장님). 여기서 그 둘을 갈라 본다.
if (!hb) {
  console.log(`${new Date().toISOString().slice(11, 19)} 올림. 이 서비스는 자기 커밋을 안 알린다(heartbeat 없음) — **도는지 못 잰다.**`);
  console.log("  잴 수 없는 것을 실패로 적지 않는다. 화면에서 직접 확인할 것.");
  process.exit(0);
}
console.log(`${new Date().toISOString().slice(11, 19)} 올림. 새 커밋이 도는지 지켜본다(최대 10분)`);
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 15_000));
  const { data: now } = await db.from("service_heartbeat").select("commit_sha, seen_at").eq("service", svc).maybeSingle();
  const nowSha = (now?.commit_sha as string | null) ?? null;
  const age = now ? (Date.now() - Date.parse(String(now.seen_at))) / 60000 : 999;
  if (nowSha && nowSha.startsWith(sha.slice(0, 7)) && age < 3) {
    console.log(`${new Date().toISOString().slice(11, 19)} **새 코드가 돈다** — ${nowSha.slice(0, 7)} · ${age.toFixed(1)}분 전 소식`);
    process.exit(0);
  }
}
console.log(`\n${new Date().toISOString().slice(11, 19)} **10분이 지나도 새 커밋이 안 돈다.** 올리기는 끝났는데 서버가 그 코드로 안 올라왔다.`);
console.log(`  올리기 전: ${beforeSha?.slice(0, 7) ?? "모름"} · 올린 것: ${sha.slice(0, 7)}`);
console.log(`  되돌리려면: git checkout ${beforeSha?.slice(0, 7) ?? "<이전커밋>"} && sh engine/tools/deploy.sh ${svc} && git checkout -`);
process.exit(1);
