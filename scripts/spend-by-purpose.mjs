// Where the money actually went, by step. Reads only — costs nothing.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].trim();
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
);

const { data, error } = await db
  .from("model_usage")
  .select("model, purpose, input_tokens, output_tokens, cost_usd");

if (error) {
  console.error(error.message);
  process.exit(1);
}

const byPurpose = new Map();
for (const row of data) {
  const key = `${row.purpose}`;
  const acc = byPurpose.get(key) ?? {
    calls: 0,
    inTok: 0,
    outTok: 0,
    usd: 0,
    model: row.model,
  };
  acc.calls += 1;
  acc.inTok += row.input_tokens ?? 0;
  acc.outTok += row.output_tokens ?? 0;
  acc.usd += Number(row.cost_usd ?? 0);
  byPurpose.set(key, acc);
}

const rows = [...byPurpose.entries()].sort((a, b) => b[1].usd - a[1].usd);
const total = rows.reduce((sum, [, v]) => sum + v.usd, 0);

console.log(`\n${data.length} calls · $${total.toFixed(4)} total\n`);
console.log(
  "step".padEnd(26) +
    "calls".padStart(6) +
    "in tok".padStart(10) +
    "out tok".padStart(10) +
    "cost".padStart(10) +
    "share".padStart(8),
);
console.log("-".repeat(70));

for (const [purpose, v] of rows) {
  console.log(
    purpose.slice(0, 25).padEnd(26) +
      String(v.calls).padStart(6) +
      v.inTok.toLocaleString().padStart(10) +
      v.outTok.toLocaleString().padStart(10) +
      ("$" + v.usd.toFixed(4)).padStart(10) +
      ((v.usd / total) * 100).toFixed(0).padStart(7) + "%",
  );
}
