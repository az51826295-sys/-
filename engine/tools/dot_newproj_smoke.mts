/** 새 프로젝트 배관 시험 — 시험 계정 하나 만들고(auth), 숨은 캐릭터에게 한 마디 흘려보낸다. */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
process.env.AI_PROVIDER = "deepseek";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { streamDotTurn } = await import("../../src/lib/dot/turn");
const db = createServiceClient();
console.log("프로젝트:", process.env.NEXT_PUBLIC_SUPABASE_URL);
const email = "smoke-test@dugeun.local";
let uid = "";
const { data: list } = await db.auth.admin.listUsers();
const found = list?.users.find((u) => u.email === email);
if (found) uid = found.id;
else { const { data, error } = await db.auth.admin.createUser({ email, password: "smoke-only-" + Date.now(), email_confirm: true }); if (error) throw error; uid = data.user.id; }
const { data: ch } = await db.from("dot_characters").select("id").eq("slug", "test-plumbing").maybeSingle();
const { data: pub } = await db.from("dot_characters").select("slug, sprites").eq("is_public", true);
console.log("공개 캐릭터:", (pub ?? []).map((c: { slug: string; sprites: Record<string,string> }) => `${c.slug}(${Object.keys(c.sprites).length}장)`).join(", "));
const t0 = Date.now(); let first = 0, acc = "";
const r = await streamDotTurn(db, uid, ch!.id as string, "안녕, 새 집은 어때?", (c) => { if (!first) first = Date.now() - t0; acc += c; });
console.log(`첫 글자 ${first}ms · 합 ${Date.now() - t0}ms`);
console.log("답:", r.ok ? `${r.reply} · ${r.emotion} · 남은 ${r.remaining}` : r);
process.exit(r.ok ? 0 : 1);
