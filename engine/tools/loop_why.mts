const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data } = await db.from("deliverables").select("content_json").eq("id","d343e34e-fe85-457f-bc71-2f6e6c54c090").maybeSingle();
const cj=(data?.content_json ?? {}) as Record<string,unknown>;
const loop=cj.loop as {stoppedBy?:string;rounds?:{n:number;broken:number;edits:number;usd:number}[];usd?:number}|null;
console.log(`멈춘 이유: ${loop?.stoppedBy} · 바퀴 ${loop?.rounds?.length} · $${loop?.usd}`);
for (const r of loop?.rounds ?? []) console.log(`  ${r.n}바퀴: 고장 ${r.broken} · 고침 ${r.edits} · $${r.usd}`);
