/**
 * **스토어에 올릴 화면을 찍는다** (11-13) — `npx tsx engine/tools/dot_store_shots.mts`
 *
 * 모델 1~2턴(방이 비어 있으면 스토어 그림이 안 된다) · 그림값 0.
 *
 * ## 왜 새로 만드나
 *
 * `dot_shots.mts` 는 **매직 링크를 손으로 받아** 390×844 **2배**(780×1688)로 찍는다. 스토어는
 * *"프로모션을 이용하려면 각 면이 최소 1,080px"* 라서 그 그림은 추천 자리에 못 쓴다.
 * 여기서는 **3배(1170×2532)** 로 찍고, 계정도 **스스로 만들고 지운다** — 사람이 링크를
 * 붙여 넣는 단계가 있으면 다음에 또 안 찍게 된다.
 *
 * ## 빈 방을 안 찍는다
 *
 * 9월 스크린샷이 낡은 까닭의 절반은 **방이 비어 있어서**다. 그래서 찍기 전에 출석하고
 * 두 마디를 건넨다 — 사람이 스토어에서 보는 것은 기능 목록이 아니라 **말이 오가는 화면**이다.
 *
 * 끝나면 임시 프로필과 시험 계정을 지운다([[orphaned-headless-blamed-the-user]]).
 */
import { readFileSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
import puppeteer from "puppeteer-core";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.DOT_URL ?? "https://dot-web-production-7e03.up.railway.app";
const OUT = "C:/Users/az518/Desktop/두근도트-스토어";
mkdirSync(OUT, { recursive: true });

const { createServiceClient } = await import("../../src/lib/supabase/service");
const svc = createServiceClient();
const email = `shot${Date.now()}@example.com`, password = "Shot!23456";

const { data: made, error: e0 } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
if (e0) { console.error("시험 계정을 못 만들었다:", e0.message); process.exit(1); }
const uid = made.user!.id;

/** 매직 링크 — 브라우저가 이 주소 하나로 로그인한다(비밀번호를 화면에 타이핑하지 않는다). */
const { data: link, error: e1 } = await svc.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: `${BASE}/dot` } });
if (e1 || !link?.properties?.action_link) { console.error("매직 링크 실패:", e1?.message); await svc.auth.admin.deleteUser(uid); process.exit(1); }

/* 방을 채운다 — 출석(하트 5) → 두 마디. */
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
const { data: s } = await anon.auth.signInWithPassword({ email, password });
const H = { authorization: `Bearer ${s!.session!.access_token}`, "content-type": "application/json" };
const chars = (await (await fetch(`${BASE}/api/dot/characters`, { headers: H })).json()) as { characters?: { id: string; slug: string; name: string }[] };
const 목록 = chars.characters ?? [];
const 주인공 = 목록.find((c) => c.slug === "yuna") ?? 목록[0];
await fetch(`${BASE}/api/dot/checkin`, { method: "POST", headers: H });
for (const 말 of ["안녕! 오늘 뭐 했어?", "나 오늘 시험 망쳤어…"]) {
  const r = await fetch(`${BASE}/api/dot/chat`, { method: "POST", headers: H, body: JSON.stringify({ characterId: 주인공.id, message: 말 }) });
  const j = (await r.json()) as { reply?: string; error?: string };
  console.log(`  말 걸기 ${r.status} — ${(j.reply ?? j.error ?? "").slice(0, 40)}`);
}

const 찍을것: [string, string, number][] = [
  ["1-대화방", `/dot/${주인공.slug}`, 4000],
  ["2-피드", "/dot/feed", 3000],
  ["3-채팅목록", "/dot/chats", 2500],
  ["4-캐릭터", "/dot/search", 2500],
];
/* 11-13 첫 판에서 뺀 것: `/dot/me` 는 **시험 계정 이름**(shot1794…)이 큼지막하게 찍힌다.
   스토어에 올릴 그림에 내 시험 흔적을 넣지 않는다. */

const profile = mkdtempSync(join(tmpdir(), "dot-store-"));
const browser = await puppeteer.launch({
  executablePath: process.env.DOT_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  userDataDir: profile,
  args: ["--no-first-run", "--lang=ko-KR"],
  /* 390×844 **3배** = 1170×2532. 스토어 추천 자리 기준(각 면 1,080px 이상)을 넘긴다. */
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
try {
  const page = await browser.newPage();
  /**
   * **쿠키로 로그인한다** — 매직 링크를 쓰면 Supabase 가 `redirect_to` 를 **프로젝트 Site URL
   * (localhost:3000)** 로 되돌려서 브라우저가 거기로 가 버린다(11-13 에 그래서 한 판 실패).
   * 비밀번호를 화면에 타이핑하지 않는다 — 운영 화면이고, 그건 내가 하는 일이 아니다.
   * `@supabase/ssr` 0.12 는 세션을 `sb-<ref>-auth-token` 에 `base64-<b64 json>` 로 적고,
   * 3180자가 넘으면 `.0`, `.1` 로 쪼갠다. 같은 모양으로 심는다.
   */
  {
    const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
    const 값 = "base64-" + Buffer.from(JSON.stringify(s!.session)).toString("base64");
    const 조각 = 값.length <= 3180 ? [[`sb-${ref}-auth-token`, 값] as const]
      : (값.match(/[\s\S]{1,3180}/g) ?? []).map((v, i) => [`sb-${ref}-auth-token.${i}`, v] as const);
    const domain = new URL(BASE).hostname;
    for (const [name, value] of 조각) await page.setCookie({ name, value, domain, path: "/", httpOnly: false, secure: true });
    console.log(`쿠키 ${조각.length}조각 심음`);
  }
  await page.goto(`${BASE}/dot`, { waitUntil: "networkidle2", timeout: 60_000 });
  await sleep(2500);
  /* 정말 들어갔나 — 안 들어갔는데 찍으면 **로그인 화면 다섯 장**이 나온다. */
  const 들어감 = await page.evaluate(() => !/\/login/.test(location.pathname) && !document.body.innerText.includes("로그인하고"));
  console.log(`로그인 뒤 주소: ${page.url()} · 들어감 ${들어감 ? "예" : "아니오"}`);
  if (!들어감) throw new Error("로그인이 안 됐다 — 쿠키 모양이 바뀌었는지 본다(빈 화면을 찍지 않는다)");
  for (const [이름, 길, 기다림] of 찍을것) {
    await page.goto(BASE + 길, { waitUntil: "networkidle2", timeout: 60_000 });
    await sleep(기다림);
    /* **처음 들어온 사람에게 뜨는 안내 카드를 닫는다.** 안 닫으면 대화가 가리고 안내문만 찍힌다
       (11-13 첫 판이 그랬다). 없으면 그냥 지나간다. */
    const 닫힘 = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => /알겠어요|닫기/.test(x.textContent ?? ""));
      if (b) { (b as HTMLButtonElement).click(); return true; }
      return false;
    });
    if (닫힘) await sleep(800);
    const p = `${OUT}/${이름}.png`;
    await page.screenshot({ path: p as `${string}.png` });
    const { width, height } = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
    console.log(`찍음 ${p} (${width * 3}x${height * 3})`);
  }
} finally {
  await browser.close();
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* 지워지면 됐다 */ }
  await svc.auth.admin.deleteUser(uid).catch(() => {});
  console.log("(임시 프로필·시험 계정 지움)");
}
