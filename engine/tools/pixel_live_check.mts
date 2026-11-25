/**
 * 진짜 도트 — 실제 사이트 한 바퀴 (11-24). 돈은 안 낸다: 결제창 주소를 받는 데까지만.
 *   npx tsx engine/tools/pixel_live_check.mts [https://dugeundot.com] [그림.png]
 * 손님 자리 → 미리보기 → 장수 0 → 받기 402 → 결제창 주소(polar) 확인. 만든 손님 계정은 끝에 지운다.
 */
import { readFileSync, writeFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) { const i = l.indexOf("="); if (i > 0 && /^[A-Z_]+$/.test(l.slice(0, i))) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^"|"$/g, ""); }
const { createClient } = await import("@supabase/supabase-js");

const BASE = process.argv[2] ?? "https://dugeundot.com";
const IMG = process.argv[3] ?? "C:/Users/az518/Desktop/두근도트-시트/nabi-sheet.png";
const jar = new Map<string, string>();
const keep = (r: Response) => { for (const c of r.headers.getSetCookie()) { const [kv] = c.split(";"); const i = kv.indexOf("="); jar.set(kv.slice(0, i), kv.slice(i + 1)); } };
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
const go = async (path: string, init: RequestInit = {}) => { const r = await fetch(BASE + path, { ...init, redirect: "manual", headers: { ...(init.headers ?? {}), cookie: cookie(), "accept-language": "ko-KR" } }); keep(r); return r; };
let pass = 0, n = 0;
const check = (name: string, ok: boolean, got: unknown) => { n++; if (ok) pass++; console.log(`${ok ? "✅" : "❌"} ${name} — ${typeof got === "string" ? got : JSON.stringify(got)}`); };

const page = await go("/pixel");
check("/pixel 열림", page.status === 200, page.status);
const g = await go("/api/dot/guest", { method: "POST" });
check("손님 자리", g.ok, await g.json());
const form = () => { const f = new FormData(); f.append("image", new Blob([readFileSync(IMG)], { type: "image/png" }), "a.png"); f.append("colors", "32"); return f; };
const t0 = Date.now();
const pv = await go("/api/pixel/convert", { method: "POST", body: form() });
const pj = await pv.json();
check("미리보기", pv.ok && String(pj.preview ?? "").startsWith("data:image/png"), { status: pv.status, period: pj.period, logical: pj.logical, colors: pj.colors, ms: Date.now() - t0, error: pj.error });
if (pj.preview) writeFileSync("engine/work/realdot/live-preview.png", Buffer.from(pj.preview.split(",")[1], "base64"));
const me = await (await go("/api/pixel/me")).json();
check("장수 0 · 결제 열림", me.shots === 0 && me.payOpen === true && me.signedIn === true, me);
const dl = await go("/api/pixel/download", { method: "POST", body: form() });
check("장수 없으면 받기 402", dl.status === 402, dl.status);
// 11-24 움직임 만들기: 가로 시트를 자동으로 나눠 줄무늬 GIF · 장수 없으면 받기 402
const mvForm = () => { const f = new FormData(); f.append("image", new Blob([readFileSync("C:/Users/az518/Desktop/두근도트-시트/taeo-strip.png")], { type: "image/png" }), "s.png"); f.append("lock", "1"); f.append("ms", "250"); return f; };
const t1 = Date.now();
const mv = await go("/api/pixel/frames", { method: "POST", body: mvForm() });
const mj = await mv.json();
check("움직임 미리보기(taeo 자동 6프레임)", mv.ok && mj.count === 6 && String(mj.gif ?? "").startsWith("data:image/gif"), { status: mv.status, count: mj.count, cell: mj.cell, how: mj.how, ms: Date.now() - t1, error: mj.error });
if (mj.gif) writeFileSync("engine/work/realdot/live-move.gif", Buffer.from(mj.gif.split(",")[1], "base64"));
const mvd = await go("/api/pixel/frames/download", { method: "POST", body: mvForm() });
check("장수 없으면 움직임 받기 402", mvd.status === 402, mvd.status);
// 11-24 AI 동작 생성: 장수 없으면 그리기 전에 402(그림 AI 를 안 부른다 = 돈 0)
const mf = new FormData(); mf.append("image", new Blob([readFileSync("C:/Users/az518/Desktop/두근도트-시트/taeo-neutral.png")], { type: "image/png" }), "c.png"); mf.append("motion", "idle");
const ai = await go("/api/pixel/motion", { method: "POST", body: mf });
// 11-25 선결제·계정 연결: 손님은 장수와 상관없이 AI 그림 전에 403(그림 AI 를 안 부른다)
check("손님이면 AI 동작 403", ai.status === 403, ai.status);
const cf = new FormData(); cf.append("desc", "a small knight"); cf.append("size", "48");
const cr = await go("/api/pixel/create", { method: "POST", body: cf });
check("손님이면 글로 만들기 403", cr.status === 403, cr.status);
const cb = new FormData(); cb.append("desc", "x"); cb.append("size", "48");
const cbr = await go("/api/pixel/create", { method: "POST", body: cb });
check("손님이면 빈 글도 403(문이 먼저)", cbr.status === 403, cbr.status);
const sf = new FormData(); for (const n of ["taeo", "haru"]) sf.append("game", new Blob([readFileSync(`C:/Users/az518/Desktop/두근도트-시트/${n}-strip.png`)], { type: "image/png" }), `${n}.png`);
const st = await go("/api/pixel/style", { method: "POST", body: sf }); const sj = await st.json().catch(() => ({}));
check("게임 그림체 분석(무료) — 키·팔레트", st.status === 200 && sj.height > 0 && sj.palette?.length > 0, { status: st.status, height: sj.height, colors: sj.palette?.length });
const gf = new FormData(); gf.append("desc", "a small knight"); gf.append("size", "48"); gf.append("game", new Blob([readFileSync("C:/Users/az518/Desktop/두근도트-시트/taeo-strip.png")], { type: "image/png" }), "g.png");
const gr = await go("/api/pixel/create", { method: "POST", body: gf });
check("손님이면 게임 그림체 만들기 403", gr.status === 403, gr.status);
const pay = await go("/api/pixel/pay", { method: "POST" });
const pyj = await pay.json();
check("손님이면 결제창 대신 403 · 연결하라는 표시", pay.status === 403 && pyj.needLogin === true, { status: pay.status, needLogin: pyj.needLogin });
// 연결 여부를 화면에 알린다
const me = await (await go("/api/pixel/me")).json().catch(() => ({}));
check("me 가 손님을 linked:false 로", me.linked === false && me.signedIn === true, me);

// 만든 손님 정리
const tok = [...jar].find(([k]) => /auth-token/.test(k));
if (tok) {
  try {
    const raw = decodeURIComponent(tok[1]).replace(/^base64-/, "");
    const s = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString());
    const uid = s.user?.id;
    if (uid) { const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } }); await db.from("dot_purchases").delete().eq("user_id", uid); await db.auth.admin.deleteUser(uid); console.log("시험 손님 지움"); }
  } catch (e) { console.log("시험 손님 정리 못 함:", (e as Error).message); }
}
console.log(`\n${pass}/${n}`);
