/** 피드와 스프라이트의 도트 밀도를 견준다 — 한 결이려면 같아야 한다. 11-08. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data } = await db.from("dot_characters").select("slug, name, photos, is_public");
const 터 = join(process.env.TEMP ?? ".", `feedtexel-${Date.now()}`);
mkdirSync(터, { recursive: true });

const paths: string[] = []; const 이름: string[] = [];
for (const c of (data as any[]).filter((x) => x.is_public).sort((a, b) => a.slug.localeCompare(b.slug))) {
  const ps: any[] = Array.isArray(c.photos) ? c.photos : c.photos ? Object.values(c.photos) : [];
  const u = ps.map((p: any) => (typeof p === "string" ? p : p?.url)).filter(Boolean)[0];
  if (!u) continue;
  const r = await fetch(u); if (!r.ok) continue;
  const p = join(터, `${c.slug}.png`);
  writeFileSync(p, Buffer.from(await r.arrayBuffer()));
  paths.push(p.split("\\").join("/")); 이름.push(c.name);
}

const py = [
  "import sys, json",
  "sys.path.insert(0, 'engine/genesis')",
  "import texel_judge as T",
  `paths = ${JSON.stringify(paths)}`,
  "out = [T.measure_one(p) for p in paths]",
  "print(json.dumps([{ 't': o.get('texel'), 'p': o.get('purity') } for o in out]))",
].join("\n");
const 결 = JSON.parse(execFileSync("python", ["-c", py], { encoding: "utf8", cwd: process.cwd() }).trim().split("\n").pop()!);

console.log("피드 사진 — 도트 크기 / 순도   (스프라이트는 전부 8 / 1.00)");
결.forEach((r: any, i: number) => console.log(`  ${이름[i].padEnd(5)} ${String(r.t ?? "못 잼").padEnd(6)} ${typeof r.p === "number" ? r.p.toFixed(2) : "-"}`));
