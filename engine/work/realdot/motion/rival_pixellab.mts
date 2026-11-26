/**
 * 라이벌 측정(11-26 사장님 "내 라이벌은 픽셀랩", 열쇠 받음): **우리 기사 그림을 그대로** 픽셀랩에 넣어
 * 4방향 + 걷기(골격 템플릿)를 만든다 → 같은 캐릭터로 나란히 견준다.
 * 비용: 픽셀랩 체험 횟수 약 3회(만들기 1 + 걷기 남·동 2). 우리 돈 0.
 *   npx tsx engine/work/realdot/motion/rival_pixellab.mts [이름=knight]
 * 결과: Desktop/두근도트-스레드/rival/<이름>/ (응답 json · zip · 풀어 둔 png)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim(); }
const KEY = process.env.PIXELLAB_API_KEY; if (!KEY) throw new Error("PIXELLAB_API_KEY 없음");
const API = "https://api.pixellab.ai/v2";
const name = process.argv[2] || "knight";
const DESC: Record<string, string> = { knight: "knight in iron armor with a sword and a shield", mage: "mage in a blue robe and pointed hat holding a staff" };
const OUT = `C:/Users/az518/Desktop/두근도트-스레드/rival/${name}`; mkdirSync(OUT, { recursive: true });
const H = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const log = (s: string) => { console.log(`${new Date().toTimeString().slice(0, 8)} ${s}`); };
async function call(method: string, path: string, body?: unknown) {
  const r = await fetch(API + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text(); let j: any; try { j = JSON.parse(txt); } catch { j = { raw: txt.slice(0, 300) }; }
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(j).slice(0, 400)}`);
  return j;
}
async function waitJob(id: string, tag: string) {
  for (let k = 0; k < 120; k++) {
    const j = await call("GET", `/background-jobs/${id}`);
    if (j.status === "completed") { log(`${tag} 끝`); return j; }
    if (j.status === "failed") throw new Error(`${tag} 실패 ${JSON.stringify(j).slice(0, 400)}`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`${tag} 10분 넘게 안 끝남`);
}
const bal0 = await call("GET", "/balance"); log(`잔액 전 ${JSON.stringify(bal0.subscription ?? bal0)}`);
const ref = readFileSync(`C:/Users/az518/Desktop/두근도트-스레드/itch-pack2/${name}/front.png`).toString("base64");
const t0 = Date.now();
// CHAR_ID 를 주면 만들기는 건너뛴다(첫 판이 걷기에서 막혔다: 체험판은 동시 1개 → 방향 하나씩)
let charId = process.env.CHAR_ID;
if (!charId) {
  const c = await call("POST", "/create-character-v3", { description: DESC[name] ?? name, reference_image: { type: "base64", base64: ref, format: "png" }, n_directions: 4, no_background: true });
  writeFileSync(`${OUT}/create.json`, JSON.stringify(c, null, 2));
  charId = c.character_id ?? c.data?.character_id; const job1 = c.background_job_id ?? c.data?.background_job_id;
  log(`캐릭터 ${charId} 작업 ${job1}`);
  if (job1) await waitJob(job1, "4방향");
}
let group: string | undefined;
for (const dir of ["south", "east"]) {
  const a = await call("POST", "/characters/animations", { character_id: charId, mode: "template", template_animation_id: "walking", directions: [dir], ...(group ? { animation_group_id: group } : {}) });
  writeFileSync(`${OUT}/anim-${dir}.json`, JSON.stringify(a, null, 2));
  group ??= a.animation_group_id;
  const jobs: string[] = a.background_job_ids ?? (a.background_job_id ? [a.background_job_id] : []);
  log(`걷기 ${dir} 작업 ${jobs.join(",") || JSON.stringify(a).slice(0, 200)}`);
  for (const j of jobs) await waitJob(j, `걷기 ${dir}`);
}
const info = await call("GET", `/characters/${charId}`); writeFileSync(`${OUT}/character.json`, JSON.stringify(info, null, 2));
const z = await fetch(`${API}/characters/${charId}/zip`, { headers: H });
if (z.ok) { writeFileSync(`${OUT}/character.zip`, Buffer.from(await z.arrayBuffer())); log(`zip ${z.status}`); } else log(`zip 실패 ${z.status}`);
const bal1 = await call("GET", "/balance"); log(`잔액 후 ${JSON.stringify(bal1.subscription ?? bal1)} · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
