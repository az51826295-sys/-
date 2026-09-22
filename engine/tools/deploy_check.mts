/**
 * **도는 쪽이 어느 커밋인가** (2026-09-22, 사장님).
 *
 * *"'올렸다' 와 '새 코드가 돈다' 는 다릅니다."* 오늘 그 둘이 두 번 갈라졌고 두 번 다 사장님이 짚어서 알았다.
 * 이 도구는 **막지 않는다 — 알리기만 한다.** 엔진 어긋남에서 "막지 말고 표시만" 을 고른 것과 같은 구분이다.
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/deploy_check.mts
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { execFileSync } = await import("node:child_process");
const db = createServiceClient();
const sh = (a: string[]) => execFileSync("git", a, { encoding: "utf8" }).trim();

const head = sh(["rev-parse", "HEAD"]);
const { data } = await db.from("service_heartbeat").select("service, commit_sha, seen_at").order("service");
if (!data?.length) { console.log("아무 서비스도 자기 커밋을 안 알렸다 — 배포가 안 됐거나 옛 코드가 돈다"); process.exit(0); }

for (const r of data) {
  const sha = (r.commit_sha as string | null) ?? null;
  const age = Math.round((Date.now() - Date.parse(String(r.seen_at))) / 60000);
  if (!sha) { console.log(`${String(r.service).padEnd(16)} 커밋 모름 (${age}분 전 소식)`); continue; }
  let behind = 0, subject = "";
  try { behind = Number(sh(["rev-list", "--count", `${sha}..HEAD`])); subject = sh(["log", "-1", "--format=%s", sha]).slice(0, 34); } catch { subject = "(이 저장소에 없는 커밋)"; }
  const same = sha.startsWith(head.slice(0, 7)) || head.startsWith(sha.slice(0, 7));
  console.log(`${String(r.service).padEnd(16)} ${sha.slice(0, 7)} · ${age}분 전 · ${same ? "**최신과 같다**" : `**배포 안 된 커밋 ${behind}개**`}`);
  if (!same && behind > 0) for (const line of sh(["log", "--format=  %h %s", `${sha}..HEAD`]).split("\n").slice(0, 8)) console.log(line.slice(0, 80));
}
console.log(`\n내 쪽 HEAD: ${head.slice(0, 7)} · ${sh(["log", "-1", "--format=%s"]).slice(0, 40)}`);
