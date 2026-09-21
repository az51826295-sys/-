/** 자기 결과물 녹화 자 — 진짜로 찍히는지. 모델 0, 돈 0. */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { captureApp, crop16x9 } = await import("../../src/lib/video/captureApp");
const { existsSync, statSync, unlinkSync } = await import("node:fs");
const db = createServiceClient();
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };
const { data } = await db.from("deliverables").select("content_json").eq("id", "0b2b6f97-0036-4718-8632-63d261b4854b").single();
const html = ((data!.content_json as { files: { path: string; contents: string }[] }).files).find((f) => /index\.html?$/i.test(f.path))!.contents;
const out = "C:/Users/az518/AppData/Local/Temp/capture_probe.webm";
const r = await captureApp(html, out, { seconds: 3, everyMs: 500 });
check("파일이 생겼다", existsSync(r.path), r.path);
const kb = existsSync(r.path) ? statSync(r.path).size / 1024 : 0;
check("**빈 파일이 아니다**", kb > 20, `${kb.toFixed(0)}KB`);
check("콘솔 오류 없음", r.consoleErrors.length === 0, r.consoleErrors);
check("**앱 화면 자리를 쟀다**", !!r.crop && r.crop.w > 300 && r.crop.h > 200, r.crop);
const c = crop16x9(r.crop);
check("16:9 로 다듬는다", !!c && Math.abs(c.w / c.h - 16 / 9) < 0.02, c);
check("다듬어도 화면 안에 있다", !!c && c.y >= 0 && c.h <= (r.crop?.h ?? 0), { c, orig: r.crop });
// **일부러 막아 본다**: 캔버스가 없는 쪽지에서는 못 재야 한다(몸통을 재면 안 된다)
const r2 = await captureApp("<p>글자만 있는 쪽지</p>", "C:/Users/az518/AppData/Local/Temp/capture_probe2.webm", { seconds: 1, drive: "none" });
check("**잴 것이 없으면 자리를 null 로 준다**", r2.crop === null || (r2.crop.w < 300 || r2.crop.h < 200), r2.crop);
for (const f of [r.path, r2.path]) { try { unlinkSync(f); } catch { /* 없으면 넘어간다 */ } }
console.log(`\n최종: ${bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`}`);
process.exit(bad ? 1 : 0);
