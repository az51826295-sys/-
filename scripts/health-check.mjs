// Prints ALIVE / DOWN for the Supabase auth endpoint. No secrets.
import { readFileSync } from "node:fs";

const env = {};
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Za-z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
try {
  const r = await fetch(env.NEXT_PUBLIC_SUPABASE_URL + "/auth/v1/health",
    { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY } });
  console.log(r.ok ? "ALIVE" : `DOWN HTTP ${r.status}`);
} catch (e) {
  console.log("DOWN", e.cause?.code || e.message);
}
