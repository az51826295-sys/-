/**
 * 충전 화면 확인 (100회차 09-13) — 충전식 씨앗 계정으로 실서버에 로그인해 /api/billing 과 메뉴의 "크레딧" 줄을 본다.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/billing_ui_check.mts
 * 설치된 Edge 를 임시 프로필로(사장님 브라우저 안 건드림). 토큰 값은 찍지 않고 있는지만. 끝나면 씨앗 계정 지움.
 */
import puppeteer from "puppeteer-core";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { createServiceClient } = await import("../../src/lib/supabase/service");
const { startPrepaid } = await import("../../src/lib/billing/ledger");
const BASE = "https://rookery-web-production.up.railway.app";
const OUT = process.argv[2] ?? join(tmpdir(), "billing-menu.png");
const svc = createServiceClient();

let bad = 0;
const check = (name: string, ok: boolean, got?: unknown) => { if (!ok) bad++; console.log(ok ? "통과" : "실패", name, ok ? "" : JSON.stringify(got)); };

const email = `billing-ui-${Date.now()}@rookery.local`;
const { data: made, error } = await svc.auth.admin.createUser({ email, password: `ui-${Math.random().toString(36).slice(2)}!`, email_confirm: true });
if (error) throw error;
const uid = made.user.id;
const profile = mkdtempSync(join(tmpdir(), "rk-bill-"));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true, userDataDir: profile, args: ["--no-first-run", "--lang=ko-KR"], defaultViewport: { width: 1280, height: 800 } });
try {
  const co = (await svc.from("companies").insert({ owner_id: uid, name: "충전 화면 확인" }).select("id").single()).data!;
  await startPrepaid(svc, co.id);
  const { data: link, error: le } = await svc.auth.admin.generateLink({ type: "magiclink", email });
  if (le) throw le;
  const page = await browser.newPage();
  await page.goto(`${BASE}/auth/confirm?token_hash=${link.properties.hashed_token}&type=magiclink`, { waitUntil: "networkidle2" });
  check("로그인 → /ask", page.url().includes("/ask"), page.url());

  const info = await page.evaluate(async () => {
    const r = await fetch("/api/billing", { cache: "no-store" });
    const j = await r.json();
    return { status: r.status, open: j.open, prepaid: j.prepaid, inApp: j.inApp, credits: j.balance?.credits, skus: (j.skus ?? []).map((s: { name: string; priceLabel: string; priceId: string }) => `${s.name} ${s.priceLabel} ${s.priceId?.slice(0, 4)}`), env: j.paddle?.env, hasToken: !!j.paddle?.clientToken };
  });
  check("/api/billing 200·열림·충전식", info.status === 200 && info.open === true && info.prepaid === true && info.inApp === false, info);
  check("체험 100 크레딧", info.credits === 100, info);
  check("상품 2개(가격 id 있음)", info.skus.length === 2 && info.skus.every((s: string) => s.endsWith("pri_")), info.skus);
  check("Paddle 샌드박스·토큰 있음", info.env === "sandbox" && info.hasToken === true, { env: info.env, hasToken: info.hasToken });

  // 메뉴 열기: 왼쪽 위 설정 단추 → "크레딧" 줄
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  await page.mouse.click(45, 45);
  const t0 = Date.now();
  const menuHas = await page
    .waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.includes("크레딧")), { timeout: 8000 })
    .then(() => true, () => false);
  const label = await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("크레딧"))?.textContent?.replace(/\s+/g, " ").trim() ?? null);
  check(`메뉴에 크레딧 줄(${Date.now() - t0}ms)`, menuHas && !!label?.includes("100"), { label, errors });
  await page.screenshot({ path: OUT as `${string}.png` });
  console.log("화면 →", OUT);
} finally {
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
  await svc.auth.admin.deleteUser(uid);
  console.log("씨앗 계정 지움", uid);
}
console.log(bad ? `실패 ${bad}` : "전부 통과");
process.exitCode = bad ? 1 : 0;
