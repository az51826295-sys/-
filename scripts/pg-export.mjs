// 옛 프로젝트의 **데이터 전부**를 JSON 으로 내린다 (09-11 로키 이주 1/2).
//
// Supabase 가 프로젝트를 막아도 Management API 의 SQL 은 열려 있다 — 그 문으로 표를 통째로 읽는다.
// 파일(storage 객체)은 못 내린다. 1.9GB 3D·영상 실험물은 두고 온다(유니티 프로젝트에 이미 있다).
//
//   SUPABASE_PAT=sbp_... node scripts/pg-export.mjs <옛 ref> <출력 폴더>
import { mkdirSync, writeFileSync } from "node:fs";

const [, , ref, outDir] = process.argv;
const pat = process.env.SUPABASE_PAT;
if (!ref || !outDir || !pat) { console.error("SUPABASE_PAT=... node scripts/pg-export.mjs <ref> <outDir>"); process.exit(1); }
mkdirSync(outDir, { recursive: true });

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

// 표 목록: public 전부 + auth 의 사용자·신원 + storage 버킷. 행이 0인 표는 건너뛴다.
const tables = await sql(`select schemaname as s, relname as t, n_live_tup as n from pg_stat_user_tables
  where schemaname='public' or (schemaname='auth' and relname in ('users','identities')) or (schemaname='storage' and relname='buckets')
  order by schemaname, relname`);
const manifest = [];
for (const { s, t, n } of tables) {
  // n_live_tup 은 추정치라 0 이어도 한 번은 센다.
  const [{ c }] = await sql(`select count(*)::int as c from "${s}"."${t}"`);
  if (c === 0) { manifest.push({ s, t, rows: 0 }); continue; }
  const rows = [];
  for (let off = 0; off < c; off += 500) {
    const [{ j }] = await sql(`select coalesce(json_agg(x), '[]'::json) as j from (select * from "${s}"."${t}" order by 1 limit 500 offset ${off}) x`);
    rows.push(...j);
  }
  writeFileSync(`${outDir}/${s}.${t}.json`, JSON.stringify(rows));
  manifest.push({ s, t, rows: rows.length });
  console.log(`  ${s}.${t}: ${rows.length}행`);
}
writeFileSync(`${outDir}/_manifest.json`, JSON.stringify(manifest, null, 2));
console.log(`끝: 표 ${manifest.length}개, 행 ${manifest.reduce((a, m) => a + m.rows, 0)} → ${outDir}`);
