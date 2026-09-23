/** 내 확인용 판(cfbc57c5)이 왜 발판을 옮겼나 — 조각 설명·심판 말·고리 기록을 읽는다. */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data } = await db.from("deliverables").select("content_json").eq("id","cfbc57c5-9b0e-4f83-a11b-72359e508923").maybeSingle();
const cj = (data?.content_json ?? {}) as Record<string, unknown>;
const patched = cj.patched as { edits?: { why: string }[] } | null;
console.log("조각 설명:"); for (const e of patched?.edits ?? []) console.log(`  - ${e.why}`);
const loop = cj.loop as { stoppedBy?: string; rounds?: { n: number; broken: number; edits: number; toPerson?: string }[]; verdict?: { toWorker?: string; broken?: string[]; unmet?: { id: string; why: string }[] } } | null;
console.log(`고리: ${loop?.stoppedBy} · ${loop?.rounds?.length}바퀴`);
for (const r of loop?.rounds ?? []) console.log(`  ${r.n}바퀴: 고장 ${r.broken} · 고침 ${r.edits} · ${r.toPerson ?? ""}`);
console.log(`심판이 고치라 한 것: ${loop?.verdict?.toWorker ?? "(없음)"}`);
for (const b of loop?.verdict?.broken ?? []) console.log(`  고장: ${b}`);
for (const u of loop?.verdict?.unmet ?? []) console.log(`  안 맞음: [${u.id}] ${u.why}`);
const ask = cj.askJudge as { verdict?: string; toPerson?: string } | null;
console.log(`부탁 심판: ${ask?.verdict ?? "-"} · ${ask?.toPerson ?? ""}`);
