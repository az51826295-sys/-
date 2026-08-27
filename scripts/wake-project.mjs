// Checks the Supabase project's status and restores it if paused.
// Reads SUPABASE_PAT / SUPABASE_PROJECT_REF from .env.local itself;
// prints status only, never secrets.
//
//   node scripts/wake-project.mjs

import { readFileSync } from "node:fs";

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^"|"$/g, "");
  }
  return out;
}

const env = { ...loadEnv(".env.local"), ...process.env };
const token = env.SUPABASE_PAT;
const ref = env.SUPABASE_PROJECT_REF;
if (!token || !ref) {
  console.error("SUPABASE_PAT / SUPABASE_PROJECT_REF 없음");
  process.exit(1);
}

const H = { Authorization: `Bearer ${token}` };

const info = await fetch(`https://api.supabase.com/v1/projects/${ref}`,
  { headers: H });
const project = await info.json();
console.log(`project: ${project.name ?? "?"}  status: ${project.status}`);

const PAUSED = ["INACTIVE", "PAUSED", "PAUSE_FAILED"];
if (PAUSED.includes(project.status)) {
  console.log("일시정지 상태 - 복구 요청...");
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/restore`,
    { method: "POST", headers: H });
  console.log(`restore: HTTP ${r.status}`);
  const t = await r.text();
  if (t) console.log(t.slice(0, 300));
  // 복구는 1~3분 걸림 - 상태를 폴링
  for (let i = 0; i < 30; i++) {
    await new Promise((s) => setTimeout(s, 10_000));
    const chk = await fetch(
      `https://api.supabase.com/v1/projects/${ref}`, { headers: H });
    const p = await chk.json();
    console.log(`  ${i * 10}s: ${p.status}`);
    if (p.status === "ACTIVE_HEALTHY") break;
  }
} else {
  console.log("일시정지 아님 - 다른 원인 조사 필요");
}
