const { createServiceClient } = await import("../../src/lib/supabase/service");
const { loadDeliverableFiles, BUCKET } = await import("../../src/lib/deliverables/files");
const { writeFileSync, mkdirSync } = await import("node:fs");
const db = createServiceClient();
const files = await loadDeliverableFiles(db, process.argv[2]);
mkdirSync(process.argv[3], { recursive: true });
for (const f of files) { const { data } = await db.storage.from(BUCKET).download(f.storagePath); if (!data) { console.log("못 받음", f.storagePath); continue; } const name = f.storagePath.split("/").pop()!; writeFileSync(`${process.argv[3]}/${name}`, Buffer.from(await data.arrayBuffer())); console.log(name, Math.round((data.size) / 1024) + "KB"); }
