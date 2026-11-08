import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local","utf8").split(String.fromCharCode(10))) { const i=l.indexOf("="); if(i>0&&!l.startsWith("#")) process.env[l.slice(0,i).trim()]=l.slice(i+1).trim(); }
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth:{autoRefreshToken:false,persistSession:false} });
const { data } = await db.from("dot_characters").select("slug,name,sprites,is_public");
const sharp = (await import("sharp")).default;
for (const c of (data as any[]).filter(x=>x.is_public&&x.sprites).sort((a,b)=>a.slug.localeCompare(b.slug))) {
  const keys = Object.keys(c.sprites).filter(k=>!k.startsWith("face")&&!k.includes(":")&&!k.startsWith("sticker"));
  const sizes = new Set<string>();
  for (const k of keys.slice(0,6)) { const r = await fetch(c.sprites[k]); if(!r.ok) continue; const m = await sharp(Buffer.from(await r.arrayBuffer())).metadata(); sizes.add(`${m.width}x${m.height}`); }
  console.log(`${c.name.padEnd(6)} ${keys.length}장  ${[...sizes].join(" / ")}`);
}
