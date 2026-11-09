/**
 * **앱이 내보내는 그림 == 저장소의 public** 인가.
 *
 * 11-09: 옛 자(`dot_cdn_match`)는 바탕화면 폴더와 견주는데 그 폴더가 낡아서 36칸이 "다름" 으로
 * 나왔다 — 제품은 멀쩡했다. **견주는 대상이 낡으면 자가 거짓 경보를 낸다.**
 * 이 자는 배포된 주소와 `public/` 을 직접 견준다(그 둘이 같아야 한다는 것이 참인 명제다).
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const h = (b: Buffer) => createHash("sha1").update(b).digest("hex").slice(0, 10);
const { data } = await db.from("dot_characters").select("slug, name, sprites, faces, photos").eq("is_public", true).order("slug");

let 같음 = 0; const 다름: string[] = [];
for (const c of (data ?? []) as any[]) {
  const 칸들: [string, string][] = [
    ...Object.entries((c.sprites ?? {}) as Record<string, string>),
    ...Object.entries((c.faces ?? {}) as Record<string, string>).map(([k, v]) => [`face:${k}`, v] as [string, string]),
  ];
  for (const [키, url] of 칸들) {
    const 길 = url.replace(/^https?:\/\/[^/]+\//, "");
    const 로컬 = `public/${길}`;
    if (!existsSync(로컬)) { 다름.push(`${c.slug} ${키} (public 에 없다)`); continue; }
    const r = await fetch(url, { cache: "no-store" as any });
    if (!r.ok) { 다름.push(`${c.slug} ${키} ${r.status}`); continue; }
    if (h(Buffer.from(await r.arrayBuffer())) === h(readFileSync(로컬))) 같음++;
    else 다름.push(`${c.slug} ${키}`);
  }
}
console.log(`앱이 내보내는 것 == public — 같음 ${같음} · 다름 ${다름.length}${다름.length ? ` (${다름.slice(0, 8).join(", ")})` : ""}`);
process.exit(다름.length ? 1 : 0);
