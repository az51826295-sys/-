/**
 * **로키가 지금 말하는 기기를 아는가** (173회차 09-18). 데모 계정으로 아이패드처럼 접속해 "내가 무슨 기종이야?" 라고 묻는다. 대화 한 턴 값(수 원).
 *   ROOKERY_DEMO_PASSWORD=… npx tsx engine/tools/rookery_env.mts engine/tools/device_probe.mts
 */
const SITE = process.env.ROOKERY_SITE ?? "https://rookery-web-production.up.railway.app";
const PASSWORD = process.env.ROOKERY_DEMO_PASSWORD ?? "";
if (!PASSWORD) { console.error("ROOKERY_DEMO_PASSWORD 가 필요하다"); process.exit(2); }
const { createClient } = await import("@supabase/supabase-js");
const { deviceLine, deviceFactsSchema } = await import("../../src/lib/hand/device");
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = createClient(SUPA, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
const { data: auth, error } = await anon.auth.signInWithPassword({ email: "demo-rookery@rookery.local", password: PASSWORD });
if (error || !auth.session) { console.error("로그인 실패:", error?.message); process.exit(1); }
const s = auth.session; const ref = new URL(SUPA).hostname.split(".")[0];
const val = "base64-" + Buffer.from(JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at, expires_in: s.expires_in, token_type: s.token_type, user: s.user })).toString("base64url");
const name = `sb-${ref}-auth-token`, CHUNK = 3180;
const cookie = val.length <= CHUNK ? `${name}=${val}` : Array.from({ length: Math.ceil(val.length / CHUNK) }, (_, i) => `${name}.${i}=${val.slice(i * CHUNK, (i + 1) * CHUNK)}`).join("; ");

// 사파리 아이패드가 실제로 보내는 모양(UA 는 Macintosh, 터치 5점, 포인터 락 없음).
const device = deviceFactsSchema.parse({ ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15", platform: "MacIntel", touchPoints: 5, screen: { w: 1180, h: 820, dpr: 2 }, viewport: { w: 1180, h: 660 }, cores: 8, memoryGB: null, gpu: "Apple GPU", pointerLock: false, standalone: false, lang: "ko-KR" });
console.log("보내는 기기 줄:", deviceLine(device));
const r = await fetch(`${SITE}/api/chat`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ messages: [{ role: "user", content: "내가 지금 무슨 기종으로 접속했는지 알 수 있어? 폰 성능은?" }], device }) });
const text = await r.text();
const done = text.split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((e) => e && e.type === "done") as { reply?: string } | undefined;
console.log("\n로키:", (done?.reply ?? text).replace(/\s+/g, " ").slice(0, 700));
const reply = done?.reply ?? "";
let bad = 0; const check = (n: string, ok: boolean) => { if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n); };
check("태블릿/아이패드라고 안다", /아이패드|iPad|태블릿/.test(reply));
check("터치 기기라고 안다", /터치/.test(reply));
check("이 기기에 대해 \"손을 돌려야 안다\" 고 하지 않는다", !/손을 .*돌려|-Watch/.test(reply));
check("모델명은 모른다고 정직하게 말한다", /모델명|정확한 기종|기종.*모르|알 수 없/.test(reply));
process.exit(bad ? 1 : 0);
