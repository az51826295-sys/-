/** 칸마다 도트 크기를 잰다 — 격자가 다른 칸이 섞여 있나. 11-08. */
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
const { data } = await db.from("dot_characters").select("slug, name, sprites, is_public");
const 터 = join(process.env.TEMP ?? ".", `texeleach-${Date.now()}`);
mkdirSync(터, { recursive: true });

const 길: string[] = []; const 이름: string[] = [];
for (const c of (data as any[]).filter((x) => x.is_public && x.sprites).sort((a, b) => a.slug.localeCompare(b.slug))) {
  for (const [감정, url] of Object.entries(c.sprites as Record<string, string>)) {
    const r = await fetch(url); if (!r.ok) continue;
    const p = join(터, `${c.slug}__${감정.replace(":", "-")}.png`);
    writeFileSync(p, Buffer.from(await r.arrayBuffer()));
    길.push(p.split("\\").join("/")); 이름.push(`${c.name} ${감정}`);
  }
}
const py = [
  "import sys, json",
  "sys.path.insert(0, 'engine/genesis')",
  "import texel_judge as T",
  `paths = ${JSON.stringify(길)}`,
  "print(json.dumps([{ 't': T.measure_one(p).get('texel'), 'p': T.measure_one(p).get('purity') } for p in paths]))",
].join("\n");
const 결 = JSON.parse(execFileSync("python", ["-c", py], { encoding: "utf8", cwd: process.cwd() }).trim().split("\n").pop()!);
const 묶음 = new Map<string, number>();
결.forEach((r: any, i: number) => {
  const k = `도트 ${r.t ?? "못 잼"}`;
  묶음.set(k, (묶음.get(k) ?? 0) + 1);
  if (r.t !== 8) console.log(`  ⚠ ${이름[i]} → ${k} · 순도 ${typeof r.p === "number" ? r.p.toFixed(2) : "-"}`);
});
console.log([...묶음].map(([k, v]) => `${k}: ${v}칸`).join("  |  "));
