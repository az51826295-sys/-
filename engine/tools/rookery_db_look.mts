/**
 * **로키 운영 DB 가 어떻게 됐나** (11-13) — 대시보드 없이 Supabase 에 직접 묻는다.
 *
 *   npx tsx engine/tools/rookery_db_look.mts            ← 보기만(아무것도 안 바꾼다)
 *   npx tsx engine/tools/rookery_db_look.mts --restore  ← 멈춘 거면 되살린다
 *
 * 열쇠: `.env.local` 의 `SUPABASE_PAT`(계정 토큰). **대화에 붙이지 않는다** — 붙은 순간 죽여야 한다
 * ([[ai-workforce-supabase-migrations]]). 이 도구는 토큰을 한 글자도 안 찍는다.
 *
 * ## 왜 이게 먼저인가
 *
 * 10-26 에 DNS 가 없다는 것까지 쟀고, "멈춘 거면 주소가 산다(두근도트 원래 것이 그 보기)" 를 대고
 * **지워진 것으로 짚었다** — 짚은 것이지 잰 것이 아니다. 멈춤이면 되살리기 단추 하나로 **장부째**
 * 돌아오고, 지워졌으면 새로 만들고 장부는 잃는다. 두 길의 값이 너무 달라서 **답을 먼저 받는다.**
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}

const PAT = (process.env.SUPABASE_PAT ?? "").trim();
const 찾는 = "cwkzdnzvvjydfxejrcfg";   // Railway rookery-web 이 가리키는 곳(.keys/rookery-main-keys.json)
if (!PAT) {
  console.log("◻︎ 못 잼 — `.env.local` 에 `SUPABASE_PAT=` 이 없다.");
  console.log("  supabase.com → Account → Access Tokens 에서 만들어 그 줄에 넣는다(대화에는 붙이지 않는다).");
  process.exit(0);
}
const api = (path: string, init: RequestInit = {}) =>
  fetch(`https://api.supabase.com/v1${path}`, { ...init, headers: { authorization: `Bearer ${PAT}`, "content-type": "application/json", ...(init.headers ?? {}) } });

const r = await api("/projects");
if (!r.ok) {
  /* 401 = 토큰이 틀림(죽음), 그 밖 = 다른 이야기. 한데 섞으면 [[wrong-key-is-not-no-money]] 꼴이 된다. */
  console.log(`✗ 프로젝트 목록을 못 받았다 — HTTP ${r.status} ${(await r.text()).slice(0, 120)}`);
  process.exit(1);
}
const 목록 = (await r.json()) as { id: string; ref?: string; name: string; status: string; organization_id: string; region: string; created_at: string }[];
console.log(`이 계정에 보이는 프로젝트 ${목록.length}개`);
for (const p of 목록) console.log(`  ${(p.ref ?? p.id).slice(0, 8)}… ${p.name.padEnd(28)} ${p.status.padEnd(18)} ${p.region} · 조직 ${p.organization_id.slice(0, 8)}…`);

const 그것 = 목록.find((p) => (p.ref ?? p.id) === 찾는);
console.log("");
if (!그것) {
  console.log(`**${찾는.slice(0, 6)}… 이 목록에 없다** — 지워졌거나 이 토큰의 계정이 아닌 조직에 있다.`);
  console.log("  → 새 프로젝트를 만들고 스키마(supabase/*.sql)를 올리는 길이다. 장부(지난 판·판정)는 돌아오지 않는다.");
  process.exit(0);
}
console.log(`${그것.name}: 상태 **${그것.status}**`);
if (그것.status === "INACTIVE" || /PAUSE/i.test(그것.status)) {
  if (!process.argv.includes("--restore")) {
    console.log("  → **멈춘 것이다.** 되살리면 장부째 돌아온다. `--restore` 를 붙이면 되살린다.");
    process.exit(0);
  }
  const rr = await api(`/projects/${찾는}/restore`, { method: "POST", body: "{}" });
  console.log(rr.ok ? "  ✓ 되살리기를 요청했다 — 몇 분 걸린다. 다시 이 도구로 상태를 본다." : `  ✗ 되살리기 실패 HTTP ${rr.status} ${(await rr.text()).slice(0, 160)}`);
} else {
  console.log("  (멈춘 상태가 아니다 — DNS 가 없는 까닭을 다른 데서 찾아야 한다)");
}
