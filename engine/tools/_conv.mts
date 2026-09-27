import { createServiceClient } from "../../src/lib/supabase/service";
const db = createServiceClient();
const { data } = await db.from("conversation_messages").select("role,content,attachments,created_at")
  .order("created_at",{ascending:false}).limit(6);
for (const r of (data ?? []) as Record<string, unknown>[]) {
  const att = (r.attachments ?? {}) as { returned?: unknown };
  console.log(`${String(r.created_at).slice(11,19)} [${r.role}]${att.returned ? " (결과 붙음)" : ""} ${String(r.content).replace(/\s+/g," ").slice(0,70)}`);
}
