// Applies a .sql file to the Supabase project via the Management API.
//
//   SUPABASE_PAT=sbp_... SUPABASE_PROJECT_REF=xxxx node scripts/run-sql.mjs supabase/schema_day2.sql
//
// The PAT is account-scoped — keep it out of the repo and pass it as an env var.
import { readFileSync } from "node:fs";

const [, , sqlPath] = process.argv;
const token = process.env.SUPABASE_PAT;
const ref = process.env.SUPABASE_PROJECT_REF;

if (!sqlPath) {
  console.error("Usage: node scripts/run-sql.mjs <path-to-sql>");
  process.exit(1);
}

if (!token || !ref) {
  console.error("Set SUPABASE_PAT and SUPABASE_PROJECT_REF.");
  process.exit(1);
}

const query = readFileSync(sqlPath, "utf8");

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query }),
});

const text = await res.text();
console.log(`status: ${res.status}`);
console.log(text.slice(0, 4000));

if (!res.ok) process.exit(1);
