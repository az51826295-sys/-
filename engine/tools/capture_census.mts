/**
 * **68개에 실제로 돌려 본다** (사장님 09-21: "68은 상한의 상한이다").
 * 캔버스가 있다고 찍히는 것은 아니다 — WebGL 이 헤드리스에서 안 뜨거나, 첫 입력 전엔 멈춰 있거나,
 * 캔버스가 빈 채로 돌 수 있다. 그래서 **돌려 보고 센다.** 값 0.
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { captureApp, cropToAspect } = await import("../../src/lib/video/captureApp");
const { statSync, existsSync, unlinkSync } = await import("node:fs");
const db = createServiceClient();
const { data } = await db.from("deliverables").select("id, title, content_json").eq("deliverable_type", "app_build");
const withCanvas = (data ?? []).map((d) => {
  const files = ((d.content_json as { files?: { path: string; contents?: string }[] } | null)?.files ?? []);
  const h = files.find((f) => /\.html?$/i.test(String(f.path)));
  return { id: d.id as string, title: String(d.title).slice(0, 22), html: h?.contents ?? "" };
}).filter((x) => x.html && /<canvas/i.test(x.html));
console.log(`캔버스 있는 산출물 ${withCanvas.length}개에 실제로 돌린다`);
let ok = 0, noCrop = 0, tiny = 0, err = 0;
const bad: string[] = [];
for (const [i, d] of withCanvas.entries()) {
  const out = `C:/Users/az518/AppData/Local/Temp/cap_${i}.webm`;
  try {
    const r = await captureApp(d.html, out, { seconds: 2, everyMs: 450, sourceDeliverableId: d.id });
    const kb = existsSync(r.path) ? statSync(r.path).size / 1024 : 0;
    const c = cropToAspect(r.crop).crop;
    if (!r.crop) { noCrop++; bad.push(`자리 못 잼: ${d.title}`); }
    else if (kb < 20) { tiny++; bad.push(`너무 작음(${kb.toFixed(0)}KB): ${d.title}`); }
    else if (r.consoleErrors.length) { err++; bad.push(`콘솔 오류: ${d.title}`); }
    else ok++;
    if (c && (i + 1) % 10 === 0) console.log(`  ${i + 1}/${withCanvas.length} … 지금까지 성공 ${ok}`);
    try { unlinkSync(out); } catch { /* 없으면 넘어간다 */ }
  } catch (e) { err++; bad.push(`못 돌림: ${d.title} — ${e instanceof Error ? e.message.slice(0, 40) : e}`); }
}
console.log(`\n캔버스 있음 ${withCanvas.length} = 성공 ${ok} + 자리 못 잼 ${noCrop} + 너무 작음 ${tiny} + 오류 ${err}`);
console.log(`합계 ${ok + noCrop + tiny + err} ${ok + noCrop + tiny + err === withCanvas.length ? "= 분모 (닫힘)" : "**안 맞음**"}`);
console.log(`**실제 상한: ${ok}개**`);
for (const b of bad.slice(0, 8)) console.log(`  ${b}`);
