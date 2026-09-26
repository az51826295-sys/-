import fs from "node:fs";
import { createServiceClient } from "../../src/lib/supabase/service";
const db = createServiceClient();
const slug = process.argv[2] ?? "yuna";
const { data } = await db.from("dot_characters").select("sprites").eq("slug", slug).maybeSingle();
const sp = (data as { sprites: Record<string, string> } | null)?.sprites ?? {};
console.log("표정:", Object.keys(sp).join(", "));
const dir = `C:/Users/az518/Desktop/도트-${slug}`;
fs.mkdirSync(dir, { recursive: true });
for (const [emo, v] of Object.entries(sp)) {
  let buf: Buffer | null = null;
  if (typeof v === "string" && v.startsWith("data:")) buf = Buffer.from(v.split(",")[1], "base64");
  else if (typeof v === "string") {
    const { data: signed } = await db.storage.from("dot").createSignedUrl(v, 600);
    if (signed?.signedUrl) buf = Buffer.from(await (await fetch(signed.signedUrl)).arrayBuffer());
    else console.log(`  ${emo}: 경로 ${v} — 못 받음`);
  }
  if (buf) { fs.writeFileSync(`${dir}/${emo}.png`, buf); console.log(`  ${emo}: ${(buf.length/1024).toFixed(0)} KB`); }
}
