/**
 * 픽셀랩 비교 (11-25, 사장님이 API 키를 줌) — 같은 조건: 64×64, 4방향, 짧은 글. 키는 환경변수 PIXELLAB_TOKEN 으로만 받고 어디에도 안 적는다.
 *   PIXELLAB_TOKEN=... npx tsx engine/work/realdot/motion/pixellab_compare.mts [desc]
 */
import { writeFileSync, mkdirSync } from "node:fs";
const TOK = process.env.PIXELLAB_TOKEN ?? "";
if (!TOK) { console.log("PIXELLAB_TOKEN 없음"); process.exit(1); }
const OUT = "C:/Users/az518/Desktop/두근도트-스레드/realdot/pixellab"; mkdirSync(OUT, { recursive: true });
const H = { Authorization: `Bearer ${TOK}`, "content-type": "application/json" };
const B = "https://api.pixellab.ai/v2";
const bal = await (await fetch(`${B}/balance`, { headers: H })).json().catch(() => null);
console.log("잔액(전):", JSON.stringify(bal));
const desc = process.argv[2] ?? "a red dragon";
const t0 = Date.now();
const r = await fetch(`${B}/create-character-with-4-directions`, { method: "POST", headers: H, body: JSON.stringify({ description: desc, image_size: { width: 64, height: 64 }, view: "side" }) });
let j: any = await r.json().catch(() => ({}));
console.log("응답", r.status, JSON.stringify(j).slice(0, 300));
const jobId = j.background_job_id ?? j.job_id ?? j.id;
for (let i = 0; i < 60 && jobId && !j.images; i++) {
  await new Promise((s) => setTimeout(s, 5000));
  const q = await fetch(`${B}/background-jobs/${jobId}`, { headers: H });
  const k: any = await q.json().catch(() => ({}));
  const st = k.status ?? k.state;
  if (i % 4 === 0) console.log("기다림", i * 5, "초", st);
  if (st === "completed" || st === "succeeded" || k.last_response?.images || k.images) { j = k.last_response ?? k.result ?? k; break; }
  if (st === "failed" || st === "error") { console.log("실패", JSON.stringify(k).slice(0, 300)); break; }
}
writeFileSync(`${OUT}/response.json`, JSON.stringify(j, (key, v) => (typeof v === "string" && v.length > 200 ? v.slice(0, 40) + "…" : v), 2));
const imgs = j.images ?? j.rotation_images ?? {};
for (const [dir, v] of Object.entries<any>(imgs)) {
  const b64 = String(v?.base64 ?? v).replace(/^data:image\/\w+;base64,/, "");
  writeFileSync(`${OUT}/${dir}.png`, Buffer.from(b64, "base64"));
}
console.log("받은 방향:", Object.keys(imgs).join(","), "·", ((Date.now() - t0) / 1000).toFixed(0), "초");
const bal2 = await (await fetch(`${B}/balance`, { headers: H })).json().catch(() => null);
console.log("잔액(후):", JSON.stringify(bal2));
