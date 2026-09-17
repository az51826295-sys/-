/**
 * 사람 스티커 자 (90회차 09-12). 하트·엉엉·화남 셋을 말 없이 보낸다(모델 3턴, 시험 계정).
 *   (1) 셋 다 답이 온다  (2) 표에 sticker=user:… 로 남는다  (3) 표정이 스티커 기분을 따른다(하트→happy/shy, 엉엉→sad, 화남→sad/shy/angry) 2/3 이상
 *   (4) 답이 짧다(≤2문장)
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
process.env.AI_PROVIDER = "deepseek";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { streamDotTurn } = await import("../../src/lib/dot/turn");
const { USER_STICKERS } = await import("../../src/lib/dot/stickers");
const db = createServiceClient();
const { data: made, error } = await db.auth.admin.createUser({ email: `ust-${Date.now()}@dugeun.local`, password: "ust-pass-0912!", email_confirm: true }); if (error) throw error;
const uid = made.user.id;
const lines: [boolean, string][] = [];
const sents = (t: string) => t.replace(/\.{2,}|…/g, "~").split(/(?<=[.!?])\s+/).filter((x) => x.trim()).length;
try {
  const { data: ch } = await db.from("dot_characters").select("id").eq("slug", "yuna").maybeSingle();
  const cid = ch!.id as string;
  const want: Record<string, string[]> = { heart: ["happy", "shy"], cry: ["sad"], angry: ["sad", "shy", "angry"] };
  const out: { k: string; reply: string; emotion: string }[] = [];
  for (const k of ["heart", "cry", "angry"]) {
    let s = ""; const r = await streamDotTurn(db, uid, cid, `(${USER_STICKERS[k].ko} 스티커)`, (c) => { s += c; }, { userSticker: k });
    if (!r.ok) throw new Error(JSON.stringify(r)); out.push({ k, reply: s, emotion: r.emotion });
  }
  lines.push([out.every((o) => o.reply.length > 0), `답 ${out.filter((o) => o.reply).length}/3`]);
  const { data: rows } = await db.from("dot_messages").select("sticker").eq("user_id", uid).eq("role", "user");
  lines.push([(rows ?? []).filter((r) => (r.sticker as string)?.startsWith("user:")).length === 3, `표 sticker=user:… ${(rows ?? []).filter((r) => (r.sticker as string)?.startsWith("user:")).length}/3`]);
  const fit = out.filter((o) => want[o.k].includes(o.emotion)).length;
  lines.push([fit >= 2, `표정 맞음 ${fit}/3 — ${out.map((o) => `${o.k}→${o.emotion}`).join(" ")}`]);
  lines.push([out.every((o) => sents(o.reply) <= 2), `짧음 ${out.map((o) => sents(o.reply)).join(",")}문장 (≤2)`]);
  console.log(out.map((o) => `  ${USER_STICKERS[o.k].ko}: "${o.reply}"`).join("\n"));
} finally { await db.auth.admin.deleteUser(uid).catch(() => {}); }
for (const [ok, s] of lines) console.log(`  ${ok ? "✅" : "❌"} ${s}`);
console.log(lines.every(([ok]) => ok) ? "모두 통과" : "떨어진 줄 있음");
process.exit(lines.every(([ok]) => ok) ? 0 : 1);
