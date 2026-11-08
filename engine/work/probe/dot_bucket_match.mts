/** 통에 든 66칸이 **바탕화면의 테두리 판과 같은 파일인가.** 올렸다는 말 대신 받아서 대조한다. */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const 밑 = "C:/Users/az518/Desktop/로키-도트/테두리-20261108";
const 해시 = (b: Buffer) => createHash("sha1").update(b).digest("hex").slice(0, 10);
const { data } = await db.from("dot_characters").select("slug, name, sprites, is_public");
let 같음 = 0; const 다름: string[] = [];
for (const c of (data as any[]).filter((x) => x.is_public && x.sprites)) {
  for (const 감정 of Object.keys(c.sprites as Record<string, string>)) {
    const 파일 = `${감정.replace(":", "-")}.png`;
    const 로컬길 = join(밑, c.slug, 파일);
    if (!existsSync(로컬길)) { 다름.push(`${c.slug}/${파일} (바탕화면에 없음)`); continue; }
    const { data: blob, error } = await db.storage.from("dot-sprites").download(`${c.slug}/${파일}`);
    if (error || !blob) { 다름.push(`${c.slug}/${파일} (못 받음)`); continue; }
    const 통 = Buffer.from(await blob.arrayBuffer());
    if (해시(통) === 해시(readFileSync(로컬길))) 같음++;
    else 다름.push(`${c.slug}/${파일} 통 ${해시(통)} ≠ 바탕 ${해시(readFileSync(로컬길))}`);
  }
}
console.log(`같음 ${같음}칸 · 다름 ${다름.length}칸`);
for (const d of 다름) console.log(`  ${d}`);
