const { createClient } = await import("@supabase/supabase-js");
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = createClient(SUPA, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
const { data, error } = await anon.auth.signInWithPassword({ email: "demo-rookery@rookery.local", password: "Rookery-Demo-2026!aA" });
if (error || !data.session) { console.error("로그인 실패:", error?.message); process.exit(1); }
const s = data.session;
const ref = new globalThis.URL(SUPA).hostname.split(".")[0];
const payload = JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at, expires_in: s.expires_in, token_type: s.token_type, user: s.user });
const val = "base64-" + Buffer.from(payload).toString("base64url");
console.log(`NAME=sb-${ref}-auth-token`);
console.log(`LEN=${val.length}`);
const { writeFileSync } = await import("node:fs");
writeFileSync(process.argv[2], val);
console.log("파일에 씀");
