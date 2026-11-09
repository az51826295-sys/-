import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const h = (b: Buffer) => createHash("sha1").update(b).digest("hex").slice(0, 10);
const { data } = await db.from("dot_characters").select("slug, sprites").eq("slug", "rin").single();
const url = (data as any).sprites["neutral"] as string;
console.log("주소:", url);
const r = await fetch(url, { cache: "no-store" as any });
const 온것 = Buffer.from(await r.arrayBuffer());
console.log("주소로 받은 것", 온것.length, "바이트", h(온것), "헤더", JSON.stringify({ age: r.headers.get("age"), cc: r.headers.get("cache-control"), etag: r.headers.get("etag") }));
const { data: blob } = await db.storage.from("dot-sprites").download("rin/neutral.png");
const 통 = Buffer.from(await blob!.arrayBuffer());
console.log("통에서 받은 것", 통.length, "바이트", h(통));
console.log("바탕화면 테두리판", readFileSync("C:/Users/az518/Desktop/로키-도트/테두리-20261108/rin/neutral.png").length, "바이트", h(readFileSync("C:/Users/az518/Desktop/로키-도트/테두리-20261108/rin/neutral.png")));
