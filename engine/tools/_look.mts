import { createServiceClient } from "../../src/lib/supabase/service";
const db = createServiceClient();
const { data } = await db.from("dot_characters").select("slug,name,look,sprites").limit(5);
for (const r of (data ?? []) as Record<string, unknown>[]) {
  const sp = r.sprites as Record<string, unknown> | null;
  console.log(`${r.slug} · ${r.name} · 표정 ${sp ? Object.keys(sp).length : 0}장`);
  if (r.look) console.log("  look:", JSON.stringify(r.look).slice(0, 220));
}
