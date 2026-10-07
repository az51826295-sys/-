/**
 * 결과물 하나를 **사람이 읽을 수 있게** 꺼낸다 (228회차 10-03). 모델 0 · 값 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/deliverable_dump.mts <업무id앞자리> [나올칸]
 *
 * 결과물은 `content_json` 한 덩어리라 그대로 보면 안 읽힌다. 글은 글대로, 파일은 파일대로 푼다.
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { writeFileSync, mkdirSync } = await import("node:fs");
const db = createServiceClient();

const 앞자리 = process.argv[2] ?? "";
const 칸 = process.argv[3] ?? "C:/Users/az518/Desktop/로키-결과물";
if (!앞자리) { console.error("업무 id 앞자리가 필요하다"); process.exit(1); }
mkdirSync(칸, { recursive: true });

const { data: 들 } = await db.from("assignments").select("id, title").order("created_at", { ascending: false }).limit(200);
const 찾음 = ((들 ?? []) as Record<string, any>[]).filter((a) => String(a.id).startsWith(앞자리));
if (찾음.length !== 1) { console.error(`앞자리 '${앞자리}' 로 ${찾음.length}건`); process.exit(1); }
const id = String(찾음[0].id);

const { data: 결, error } = await db.from("deliverables").select("title, content_json").eq("assignment_id", id).order("created_at", { ascending: false });
if (error) { console.error(error.message); process.exit(1); }

for (const d of ((결 ?? []) as Record<string, any>[])) {
  const c = d.content_json as Record<string, any>;
  console.log(`\n══ ${d.title}`);
  console.log(`칸: ${Object.keys(c ?? {}).join(" · ")}`);

  // 파일이 있으면 통째로 내린다 — 돌려 봐야 아는 것들이 있다.
  const 파일들 = (c?.files ?? c?.app?.files ?? []) as { path: string; contents: string }[];
  for (const f of 파일들) {
    // 폴더를 떼면 안 된다. 10-03 에 `README.md` 와 `art/README.md` 가 **같은 자리에 덮여** 하나가 사라졌다.
    const 안전 = String(f.path).split("\\").join("/").replace(/^[/.]+/, "").replace(/\.\./g, "_");
    const p = `${칸}/${안전}`;
    mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true });
    writeFileSync(p, f.contents ?? "");
    console.log(`  파일 → ${p} (${((f.contents ?? "").length / 1024).toFixed(0)}KB)`);
  }

  // 글은 글대로. 긴 글자 칸을 전부 찾아 따로 떨군다.
  const 글칸: [string, string][] = [];
  const 훑기 = (o: any, 길: string, 깊이 = 0) => {
    if (깊이 > 3 || o == null) return;
    if (typeof o === "string") { if (o.length > 400) 글칸.push([길, o]); return; }
    if (Array.isArray(o)) { o.forEach((v, i) => 훑기(v, `${길}[${i}]`, 깊이 + 1)); return; }
    if (typeof o === "object") for (const [k, v] of Object.entries(o)) if (k !== "files") 훑기(v, 길 ? `${길}.${k}` : k, 깊이 + 1);
  };
  훑기(c, "");
  for (const [길, 글] of 글칸) {
    const p = `${칸}/${길.replace(/[^\w가-힣]+/g, "_").slice(0, 60)}.md`;
    writeFileSync(p, 글);
    console.log(`  글 → ${p} (${글.length}자)`);
  }
  if (!파일들.length && !글칸.length) writeFileSync(`${칸}/통째로.json`, JSON.stringify(c, null, 2));
}
