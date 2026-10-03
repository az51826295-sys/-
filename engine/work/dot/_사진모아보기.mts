/** 여섯 명의 목록 사진을 한 장에 모아 본다 — 결이 맞는지는 **나란히 놓고** 봐야 안다. */
import { readFileSync, writeFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
import sharp from "sharp";
const { createServiceClient } = await import("../../../src/lib/supabase/service");
const db = createServiceClient();
const { data } = await db.from("dot_characters").select("slug, name, photos, faces").eq("is_public", true).order("slug");
const 사람들 = (data ?? []) as any[];
const W = 200, H = 250, 칸 = 3;
const 줄 = Math.ceil(사람들.length / 칸);
const 바닥 = await sharp({ create: { width: W * 칸, height: H * 줄, channels: 4, background: "#111" } }).png().toBuffer();
const 얹을것: sharp.OverlayOptions[] = [];
for (const [i, c] of 사람들.entries()) {
  const url = c.photos?.[0]?.url ?? c.faces?.neutral;
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  얹을것.push({ input: await sharp(buf).resize(W, H, { fit: "cover", kernel: "nearest" }).png().toBuffer(), left: (i % 칸) * W, top: Math.floor(i / 칸) * H });
  console.log(`${c.name.padEnd(4)} ${c.photos?.[0] ? `사진("${c.photos[0].caption}")` : "**얼굴로 대신**"}`);
}
const 나온곳 = "C:/Users/az518/Desktop/두근도트-시트/목록-여섯명.png";
writeFileSync(나온곳, await sharp(바닥).composite(얹을것).png().toBuffer());
console.log("\n→", 나온곳);
