// 새 프로젝트에 스키마를 깔고 JSON 데이터를 붓는다 (09-11 로키 이주 2/2).
//
//   SUPABASE_PAT=sbp_... node scripts/pg-import.mjs <새 ref> <내려받은 폴더>
//
// 1) supabase/*.sql 을 **day 번호순**으로 적용(08-27 되살릴 때 배운 것: 알파벳순이면 day10 이 day2 앞에 온다).
// 2) 데이터: FK 순서를 따지지 않으려고 `session_replication_role = replica` 로 붓는다(트리거·FK 검사 끔).
//    auth.users / auth.identities 도 그대로 붓는다 — 같은 id·같은 비밀번호 해시라 사장님이 다시 가입할 필요가 없다.
// 3) 시퀀스를 최댓값 뒤로 맞춘다(bigserial 표가 다음 행에서 키 충돌을 내지 않게).
import { readFileSync, readdirSync, existsSync } from "node:fs";

const [, , ref, inDir] = process.argv;
const pat = process.env.SUPABASE_PAT;
if (!ref || !inDir || !pat) { console.error("SUPABASE_PAT=... node scripts/pg-import.mjs <ref> <inDir>"); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function sql(query) {
  // Management API 는 분당 호출을 제한한다(429). 기다렸다 다시 — 이주는 급하지 않다, 빠뜨리는 게 문제다.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST", headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }),
    });
    const text = await res.text();
    if (res.status === 429 && attempt < 8) { await sleep(4000 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`SQL ${res.status}: ${text.slice(0, 400)}`);
    await sleep(250);
    return text ? JSON.parse(text) : null;
  }
}
const dataOnly = process.argv.includes("--data-only");
const onlyAt = process.argv.indexOf("--only");
const onlySchema = onlyAt > 0 ? process.argv[onlyAt + 1] : null;   // 예: --only auth

// ── 1) 스키마 ──
const dayNo = (f) => { const m = f.match(/schema_day(\d+)/); return m ? Number(m[1]) : null; };
const files = readdirSync("supabase").filter((f) => f.endsWith(".sql"));
const ordered = [
  ...files.filter((f) => f === "schema.sql"),
  ...files.filter((f) => dayNo(f) !== null).sort((a, b) => dayNo(a) - dayNo(b)),
  ...files.filter((f) => f !== "schema.sql" && dayNo(f) === null).sort(),
];
console.log(`1) 스키마 ${ordered.length}개${dataOnly ? " (건너뜀)" : ""}`);
let okFiles = 0; const failed = [];
for (const f of dataOnly ? [] : ordered) {
  try { await sql(readFileSync(`supabase/${f}`, "utf8")); okFiles++; }
  catch (e) { failed.push([f, String(e.message).slice(0, 160)]); }
}
console.log(`   적용 ${okFiles}/${ordered.length}` + (failed.length ? `\n   실패:\n` + failed.map(([f, m]) => `     ${f}: ${m}`).join("\n") : ""));

// ── 2) 데이터 ──
const manifest = JSON.parse(readFileSync(`${inDir}/_manifest.json`, "utf8"));
// storage.buckets 먼저(objects 는 안 옮긴다), 그다음 auth, 그다음 public.
const order = [...manifest.filter((m) => m.s === "storage"), ...manifest.filter((m) => m.s === "auth"), ...manifest.filter((m) => m.s === "public")];
console.log(`2) 데이터 ${order.filter((m) => m.rows > 0).length}개 표`);
let total = 0; const dataFail = [];
for (const { s, t, rows } of order) {
  if (rows === 0) continue;
  if (onlySchema && s !== onlySchema) continue;
  const file = `${inDir}/${s}.${t}.json`;
  if (!existsSync(file)) continue;
  const data = JSON.parse(readFileSync(file, "utf8"));
  // 새 스키마에 없는 열은 뺀다(옛 DB 에만 있던 ad-hoc 열이 있을 수 있다).
  // 생성 열(auth.users.confirmed_at, auth.identities.email 같은 것)은 값을 넣을 수 없다 — 뺀다.
  const cols = (await sql(`select a.attname as column_name from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='${s}' and c.relname='${t}' and a.attnum>0 and not a.attisdropped and a.attgenerated = ''`)).map((c) => c.column_name);
  if (cols.length === 0) { dataFail.push([`${s}.${t}`, "표가 새 스키마에 없다"]); continue; }
  const trimmed = data.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => cols.includes(k))));
  // 요청 하나가 너무 크면 413. 행 수가 아니라 **바이트**로 자른다(대화·산출물 표는 행 하나가 수십 KB 다).
  const LIMIT = 350 * 1024;
  let i = 0;
  while (i < trimmed.length) {
    const batch = []; let bytes = 2;
    while (i < trimmed.length) {
      const one = JSON.stringify(trimmed[i]);
      if (batch.length && bytes + one.length > LIMIT) break;
      batch.push(trimmed[i]); bytes += one.length + 1; i++;
    }
    const chunk = JSON.stringify(batch).replace(/'/g, "''");
    try {
      const colList = cols.map((c) => `"${c}"`).join(", ");
      await sql(`set session_replication_role = replica;
        insert into "${s}"."${t}" (${colList}) select ${colList} from json_populate_recordset(null::"${s}"."${t}", '${chunk}'::json) on conflict do nothing;`);
      total += batch.length;
    } catch (e) { dataFail.push([`${s}.${t}`, String(e.message).slice(0, 200)]); break; }
  }
}
console.log(`   부은 행 ${total}` + (dataFail.length ? `\n   실패:\n` + dataFail.map(([t, m]) => `     ${t}: ${m}`).join("\n") : ""));

// ── 3) 시퀀스 ──
const seqs = await sql(`select s.relname as seq, t.relname as tbl, a.attname as col from pg_class s
  join pg_depend d on d.objid=s.oid join pg_class t on t.oid=d.refobjid join pg_attribute a on a.attrelid=t.oid and a.attnum=d.refobjsubid
  join pg_namespace n on n.oid=s.relnamespace where s.relkind='S' and n.nspname='public'`);
for (const { seq, tbl, col } of seqs) await sql(`select setval('public."${seq}"', coalesce((select max("${col}") from public."${tbl}"), 0) + 1, false)`);
console.log(`3) 시퀀스 ${seqs.length}개 맞춤`);

const [{ tables }] = await sql(`select count(*)::int as tables from pg_tables where schemaname='public'`);
const [{ users }] = await sql(`select count(*)::int as users from auth.users`);
console.log(`끝: public 표 ${tables}개 · 사용자 ${users}명`);
