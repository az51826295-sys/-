/**
 * **사장님 말을 결과물에 잇는다** (226회차 2026-09-26).
 *
 * 취향 자를 만들려다 재료가 없다는 것을 알았다: 물림 42건 중 **어느 결과물 얘기인지 이어진 것이 3건**.
 * 판정 단추는 7건(결과물 400개 중), 말은 319줄 — 둘이 따로 놀았다.
 *
 * 이 자는 지난 대화에서 **결과물이 실려 나간 답 바로 뒤의 사장님 말**만 골라 다시 읽는다
 * (`about` — 그 말이 결과물의 어느 자리를 짚었나). 결과물이 없는 턴은 건드리지 않는다: 값이 그만큼 준다.
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/taste_collect.mts        # 셈만(돈 0)
 *   npx tsx engine/tools/rookery_env.mts engine/tools/taste_collect.mts --run  # 읽는다(모델 값)
 */
import { createServiceClient } from "../../src/lib/supabase/service";
import { labelReactions, type Turn } from "../../src/lib/genesis/reaction";
import { defaultProviders } from "../../src/lib/execution/shared";

const RUN = process.argv.includes("--run");
const REDO = process.argv.includes("--redo");   // 밀려 붙은 옛 기록을 씻고 다시 읽는다
const db = createServiceClient();

const { data } = await db.from("conversation_messages")
  .select("id, conversation_id, role, content, attachments, created_at")
  .order("created_at", { ascending: false }).limit(2000);
const rows = (data ?? []) as { id: string; conversation_id: string; role: string; content: string; attachments: Record<string, unknown> | null; created_at: string }[];
rows.reverse();

const byConv = new Map<string, typeof rows>();
for (const m of rows) byConv.set(m.conversation_id, [...(byConv.get(m.conversation_id) ?? []), m]);

const turns: Turn[] = [];
for (const list of byConv.values()) {
  for (let j = 0; j < list.length; j++) {
    const next = list[j];
    if (next.role !== "user") continue;
    let ai = -1;
    for (let k = j - 1; k >= 0 && list[k].role !== "user"; k--) if (list[k].role === "assistant") { ai = k; break; }
    if (ai < 0) continue;
    const m = list[ai];
    const att = (m.attachments ?? {}) as { returned?: { deliverableId?: string }; assignment?: { title?: string } };
    const did = att.returned?.deliverableId;
    if (!did) continue;                                   // 결과물이 안 실린 턴은 취향 재료가 아니다
    const prev = [...list.slice(0, ai)].reverse().find((x) => x.role === "user");
    turns.push({
      id: next.id, order: prev?.content ?? "", answer: m.content, reply: next.content,
      attachments: next.attachments, deliverable: { id: did, title: att.assignment?.title ?? null },
    });
  }
}

const already = turns.filter((t) => typeof ((t.attachments?.reaction ?? {}) as { about?: string }).about === "string").length;
console.log(`결과물이 실린 턴 ${turns.length}개 · 이미 읽은 것 ${already} · 읽을 것 ${turns.length - already}`);
if (!turns.length) { console.log("이을 재료가 없다."); process.exit(0); }
if (!RUN) { console.log("\n--run 을 붙이면 읽는다."); process.exit(0); }

const reactions = await labelReactions(turns, { ai: defaultProviders().ai, db, needAbout: true, redo: REDO });
let rej = 0, acc = 0, withAbout = 0;
const lines: string[] = [];
for (const t of turns) {
  const r = reactions.get(t.id);
  if (!r) continue;
  if (r.rejected) rej++;
  if (r.accepted) acc++;
  if (r.about) { withAbout++; if (lines.length < 12) lines.push(`${r.rejected ? "물림" : r.accepted ? "받음" : "  · "} [${r.about}] "${t.reply.slice(0, 40)}"`); }
}
console.log(`\n읽음 ${reactions.size} · 물림 ${rej} · 받아들임 ${acc} · **어디를 짚었는지 남은 것 ${withAbout}**`);
for (const l of lines) console.log("  " + l);
