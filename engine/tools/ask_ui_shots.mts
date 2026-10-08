/**
 * **로키 /ask 화면 찍기** (10-09). 모델 0 · 값 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/ask_ui_shots.mts
 *
 * UI 는 화면을 본 사람만 판단할 수 있다 — 설명서만 읽고 쓴 지적은 10개 중 3개가 틀렸었다(UX-AUDIT-v1).
 * 그래서 고치기 전에 **실제 배포된 화면**을 폰 크기·데스크톱 크기로 찍어 둔다.
 * 로그인은 screen.ts 와 같은 길(촬영용 계정 → supabase 세션 → 쿠키).
 * 띄운 브라우저는 반드시 트리째 끝낸다(09-24 고아 154개 사건).
 */
import { mkdirSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";

const { browserPath } = await import("../../src/lib/video/screen");

const SITE = process.env.ROOKERY_SITE ?? "https://rookery-web-production.up.railway.app";
const OUT = "engine/docs/ui-ask";
const EMAIL = "demo-rookery@rookery.local";
const PASSWORD = "Rookery-Demo-2026!aA";

/** 폰 한 대 · 데스크톱 한 대. 둘 다 봐야 한다 — 좁은창.tsx 가 따로 있을 만큼 폭이 갈린다. */
const SIZES = [
  { 이름: "폰", width: 390, height: 844, scale: 2 },
  { 이름: "데스크톱", width: 1440, height: 900, scale: 1 },
];

const exe = browserPath();
if (!exe) { console.error("브라우저를 못 찾았다"); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const { createClient } = await import("@supabase/supabase-js");
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
const { data: sess, error } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (error || !sess.session) { console.error("촬영용 계정으로 못 들어갔다:", error?.message); process.exit(1); }
const s = sess.session;
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
const cookieValue = "base64-" + Buffer.from(JSON.stringify({
  access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at,
  expires_in: s.expires_in, token_type: s.token_type, user: s.user,
})).toString("base64url");

const profile = await mkdtemp(path.join(tmpdir(), "rk-hl-ui-"));
const port = 9700 + Math.floor(Math.random() * 200);
const proc = spawn(exe, [
  "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
  "--force-device-scale-factor=1", "--lang=ko-KR", "--hide-scrollbars",
  `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, "about:blank",
], { stdio: "ignore", detached: false });

const 끝내기 = () => { try { spawn("taskkill", ["/pid", String(proc.pid), "/t", "/f"], { stdio: "ignore" }); } catch { proc.kill(); } };
process.on("exit", 끝내기);

let ws = "";
for (let i = 0; i < 60 && !ws; i++) {
  await new Promise((r) => setTimeout(r, 500));
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/version`);
    if (r.ok) ws = ((await r.json()) as { webSocketDebuggerUrl?: string }).webSocketDebuggerUrl ?? "";
  } catch { /* 아직 */ }
}
if (!ws) { console.error("브라우저가 30초 안에 안 떴다"); 끝내기(); process.exit(1); }

const browser = await puppeteer.connect({ browserWSEndpoint: ws, defaultViewport: null });
try {
  for (const 크기 of SIZES) {
    const page = await browser.newPage();
    await page.setViewport({ width: 크기.width, height: 크기.height, deviceScaleFactor: 크기.scale });
    await page.setCookie({ name: `sb-${ref}-auth-token`, value: cookieValue, domain: new URL(SITE).hostname, path: "/", httpOnly: false, secure: true });
    await page.goto(`${SITE}/ask`, { waitUntil: "networkidle2", timeout: 120_000 });
    await new Promise((r) => setTimeout(r, 3500));
    const 길 = `${OUT}/ask-${크기.이름}.png`;
    await page.screenshot({ path: 길 as `${string}.png` });
    console.log("찍음:", 길, `${크기.width}×${크기.height}`);
    await page.close();
  }
} finally {
  await browser.disconnect();
  끝내기();
}
