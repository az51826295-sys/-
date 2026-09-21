/** HTML 이 있는 산출물 중 **캔버스가 있는 것**이 몇 개인가 = captureApp 이 덮는 상한. 값 0. */
const { createServiceClient } = await import("@/lib/supabase/service");
const db = createServiceClient();
const { data } = await db.from("deliverables").select("id, title, created_at, content_json").eq("deliverable_type", "app_build");
let html = 0, canvas = 0, dom = 0;
const domOnes: string[] = [];
for (const d of data ?? []) {
  const files = ((d.content_json as { files?: { path: string; contents?: string }[] } | null)?.files ?? []);
  const h = files.find((f) => /\.html?$/i.test(String(f.path)));
  if (!h?.contents) continue;
  html++;
  if (/<canvas/i.test(h.contents)) canvas++; else { dom++; if (domOnes.length < 5) domOnes.push(String(d.title).slice(0, 22)); }
}
console.log(`HTML 있는 산출물 ${html}개`);
console.log(`  캔버스 있음 ${canvas} (${Math.round(canvas / html * 100)}%) — captureApp 이 자리를 잴 수 있다`);
console.log(`  캔버스 없음(DOM 앱) ${dom} (${Math.round(dom / html * 100)}%) — 지금은 null 이라 광고 재료로 못 쓴다`);
console.log(`  합계 ${canvas + dom} ${canvas + dom === html ? "= 분모 (닫힘)" : "**안 맞음**"}`);
console.log(`  DOM 앱 보기: ${domOnes.join(" · ")}`);
