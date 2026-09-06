// 대화 행의 base64 그림을 저장소로 옮기고 행에는 경로만 남긴다(images.ts 와 같은 모양).
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const BUCKET = "deliverable-files";
const log = (...a) => console.log(new Date().toISOString().slice(11,19), ...a);

// 어느 행에 그림이 있나 — 행 전체를 끌지 않고 개수만.
const { data: rows, error } = await db.from("conversation_messages")
  .select("id, conversation_id, n:attachments->images")
  .not("attachments->images", "is", null);
if (error) throw error;
const targets = rows.filter(r => Array.isArray(r.n) && r.n.some(i => typeof i?.dataUrl === "string" && i.dataUrl.startsWith("data:")));
log("그림 든 행", rows.length, "옮길 행", targets.length);
const { data: convs } = await db.from("conversations").select("id, owner_id").in("id", [...new Set(targets.map(t=>t.conversation_id))]);
const { data: comps } = await db.from("companies").select("id, owner_id");
const companyOf = new Map(); for (const c of convs ?? []) { const co = (comps ?? []).find(x => x.owner_id === c.owner_id); if (co) companyOf.set(c.id, co.id); }

for (const t of targets) {
  const companyId = companyOf.get(t.conversation_id);
  if (!companyId) { log("회사 못 찾음", t.id); continue; }
  const { data: row, error: e1 } = await db.from("conversation_messages").select("attachments").eq("id", t.id).single();
  if (e1) { log("읽기 실패", t.id, e1.message); continue; }
  const att = row.attachments ?? {};
  const out = [];
  for (const img of att.images ?? []) {
    if (typeof img?.dataUrl !== "string" || !img.dataUrl.startsWith("data:")) { out.push(img); continue; }
    const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(img.dataUrl);
    if (!m) continue;
    const ext = m[1] === "image/jpeg" ? "jpg" : m[1].split("/")[1];
    const path = `${companyId}/chat/${randomUUID()}.${ext}`;
    const { error: e2 } = await db.storage.from(BUCKET).upload(path, Buffer.from(m[2], "base64"), { contentType: m[1] });
    if (e2) { log("업로드 실패", t.id, e2.message); continue; }
    out.push({ path, prompt: img.prompt ?? "" });
  }
  const { error: e3 } = await db.from("conversation_messages").update({ attachments: { ...att, images: out } }).eq("id", t.id);
  log(e3 ? "갱신 실패 " + e3.message : "옮김", t.id.slice(0,8), (att.images ?? []).length, "→", out.length);
}
log("끝");
