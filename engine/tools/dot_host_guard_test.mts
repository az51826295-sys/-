/** 도트 도메인에서 회사 화면이 막히는가. 서버를 띄우지 않고 문지기만 부른다. */
process.env.DOT_HOSTS = "dot.example.com";
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "anon";
const { NextRequest } = await import("next/server");
const { proxy } = await import("../../src/proxy");

let fail = 0;
async function check(host: string, path: string, want: "통과" | "돌려보냄") {
  const req = new NextRequest(`https://${host}${path}`, { headers: { host } });
  let got: "통과" | "돌려보냄" = "통과";
  try {
    const res = await proxy(req);
    if (res.status >= 300 && res.status < 400 && (res.headers.get("location") ?? "").endsWith("/dot")) got = "돌려보냄";
  } catch { /* updateSession 이 진짜 통신을 시도하면 여기로 온다 = 문지기는 통과시킨 것 */ }
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? "✅" : "❌"} ${host}${path.padEnd(22)} → ${got} (기대 ${want})`);
}

console.log("── 도트 도메인 ──");
await check("dot.example.com", "/dot", "통과");
await check("dot.example.com", "/dot/yuna", "통과");
await check("dot.example.com", "/api/dot/chat", "통과");
await check("dot.example.com", "/login", "통과");
await check("dot.example.com", "/manifest.webmanifest", "통과");
await check("dot.example.com", "/ask", "돌려보냄");
await check("dot.example.com", "/api/unity/checks", "돌려보냄");
await check("dot.example.com", "/", "돌려보냄");
await check("dot.example.com", "/dotted", "돌려보냄");   // 접두사만 같은 길에 안 속는다

console.log("── 로키 도메인(안 막는다) ──");
await check("rookery.example.com", "/ask", "통과");
await check("rookery.example.com", "/dot", "통과");

console.log(fail === 0 ? "\n모두 통과" : `\n${fail}개 실패`);
process.exit(fail ? 1 : 0);
