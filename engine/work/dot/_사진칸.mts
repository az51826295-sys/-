import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
const { createServiceClient } = await import("../../../src/lib/supabase/service");
const db = createServiceClient();
const { data } = await db.from("dot_characters").select("slug, photos, sprites, faces").eq("slug", "yuna").maybeSingle();
const c = data as any;
console.log("photos:", JSON.stringify(c.photos).slice(0, 300));
console.log("sprites 칸:", Object.keys(c.sprites ?? {}).join(", "));
console.log("faces 칸:", Object.keys(c.faces ?? {}).join(", "));
