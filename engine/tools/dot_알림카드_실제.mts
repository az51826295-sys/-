/**
 * **알림 카드가 진짜 대화창에 뜨나** (10-17). 모델 4턴(두근도트 열쇠 · 약 $0.002).
 *   npx tsx engine/tools/dot_알림카드_실제.mts [--sabotage]
 *
 * 10-13 에 두 쪽을 갈라서 쟀다 — **언제 뜨나**는 `pushAsk.ts` 단위 시험으로,
 * **어떻게 보이나**는 CSS 를 베낀 미리보기 사진으로. 그런데 **둘을 합친 것**,
 * 즉 "진짜 로그인한 대화창에서 네 마디 뒤에 정말 뜨는가" 는 여태 **아무도 못 봤다**
 * — 사장님 손가락 네 개 중 하나로 남아 있었다. 그걸 여기서 없앤다.
 *
 * 길: 시험 계정을 만들고(서비스 열쇠 · e2e 자와 같은 방식) → **API 로** 네 마디를 보내고
 * → 그 사람의 쪽지(세션)를 헤드리스 브라우저 쿠키에 넣어 대화창을 열고 → 카드를 센다.
 * **비밀번호를 어느 칸에도 치지 않는다.** 끝나면 계정을 지운다(떨어져도 지운다).
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.trimStart().startsWith("#") && !(l.slice(0, i).trim() in process.env)) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const { openHeadless } = await import("../../src/lib/video/headless");

const BASE = process.env.DOT_URL ?? "https://dot-web-production-7e03.up.railway.app";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const svc = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const 집 = url.match(/https:\/\/([a-z0-9]+)\./)![1];

let 나쁨 = 0;
const 재기 = (n: string, ok: boolean, 본?: unknown) => { if (!ok) 나쁨++; console.log(ok ? "통과" : "실패", n, ok ? "" : JSON.stringify(본)); };
const 못잼 = (n: string, 본?: unknown) => { console.log("못잼", n, JSON.stringify(본)); };

const email = `card-${Date.now()}@dugeun.local`, password = `card-${Math.random().toString(36).slice(2)}!A9`;
let uid = "";
try {
  const { data: made, error: e0 } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (e0) throw e0; uid = made.user.id;
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { data: s, error: e1 } = await c.auth.signInWithPassword({ email, password });
  if (e1) throw e1;
  const sess = s.session!;
  const H = { authorization: `Bearer ${sess.access_token}`, "content-type": "application/json" };

  /* ① 캐릭터 하나 집고 ② API 로 네 마디 — 카드는 "내가 건 말 4개" 에서 뜬다(물어볼턴) */
  const { 물어볼턴 } = await import("../../src/lib/dot/pushAsk");
  const 들 = (await fetch(`${BASE}/api/dot/characters`).then((r) => r.json())) as { characters: { id: string; slug: string; name: string }[] };
  const 누구 = 들.characters[0];
  const 말들 = ["안녕, 처음 왔어", "오늘 학교 갔다 왔어", "좀 피곤하네", "너는 뭐 했어?", "그렇구나"];
  const 보낼것 = 말들.slice(0, 물어볼턴);
  for (const m of 보낼것) {
    const r = await fetch(`${BASE}/api/dot/chat/stream`, { method: "POST", headers: H, body: JSON.stringify({ characterId: 누구.id, message: m }) });
    if (!r.ok) throw new Error(`말 보내기 ${r.status}: ${await r.text()}`);
    await r.text();                                        // 끝까지 받아야 저장이 끝난다
  }
  const 기록 = (await fetch(`${BASE}/api/dot/history?characterId=${누구.id}`, { headers: H }).then((r) => r.json())) as { messages: { role: string }[] };
  const 내말 = 기록.messages.filter((m) => m.role === "user").length;
  재기(`내가 건 말이 ${물어볼턴}개 쌓였다`, 내말 >= 물어볼턴, { 내말, 물어볼턴 });

  /* ③ 쪽지를 쿠키로 넣고 대화창을 연다. @supabase/ssr 0.12 는 `base64-` + base64url, 길면 .0/.1 로 쪼갠다. */
  const 값 = "base64-" + Buffer.from(JSON.stringify(sess)).toString("base64url");
  const 이름 = `sb-${집}-auth-token`;
  const 조각 = 값.match(/.{1,3180}/g)!;
  const 쿠키 = 조각.length === 1
    ? [{ name: 이름, value: 값 }]
    : 조각.map((v, i) => ({ name: `${이름}.${i}`, value: v }));

  const 창 = await openHeadless({ width: 390, height: 844 });
  if (!창) { 못잼("브라우저를 못 열었다"); process.exit(1); }
  try {
    const page = await 창.browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    const 터 = new URL(BASE);
    await page.setCookie(...쿠키.map((k) => ({ ...k, domain: 터.hostname, path: "/", httpOnly: false, secure: true })));
    if (process.argv.includes("--sabotage")) {
      /* 심은 고장: "전에 물어봤다" 표를 미리 꽂아 둔다 → 카드가 뜨면 안 된다.
         (자가 아무 때나 통과하면 이빨이 없는 것이다) */
      await page.evaluateOnNewDocument(() => { try { localStorage.setItem("dot-push-ask-v1", "1"); } catch { /* */ } });
    }
    await page.goto(`${BASE}/dot/${누구.slug}`, { waitUntil: "networkidle2", timeout: 60_000 });
    await new Promise((r) => setTimeout(r, 2500));

    const 본 = await page.evaluate(() => {
      const el = document.querySelector(".kk-ask");
      const 글 = (document.body.innerText ?? "").replace(/\s+/g, " ");
      return {
        로그인: !/로그인|login/i.test(location.pathname),
        카드: !!el,
        카드글: el ? (el as HTMLElement).innerText.replace(/\s+/g, " ").trim() : "",
        단추: Array.from(document.querySelectorAll(".kk-ask button")).map((b) => (b.textContent ?? "").trim()),
        내말수: document.querySelectorAll(".kk-bubble.me, .kk-row.me").length,
        넘침: document.documentElement.scrollWidth > window.innerWidth,
        글앞: 글.slice(0, 120),
      };
    });

    if (!본.로그인) { 못잼("쿠키로 로그인이 안 됐다 — 카드는 판단하지 않는다", { 길: await page.url() }); }
    else {
      재기("로그인한 대화창이 열렸다", 본.로그인, 본);
      if (process.argv.includes("--sabotage")) {
        재기("[심은 고장] 전에 물어봤으면 카드가 안 뜬다", !본.카드, 본);
      } else {
        재기("**네 마디 뒤에 알림 카드가 뜬다**", 본.카드, 본);
        재기("카드에 알림을 켜는 단추가 있다", 본.단추.some((b) => b.includes("알림")), 본.단추);
        재기("카드에 '나중에' 가 있다", 본.단추.some((b) => b.includes("나중에")), 본.단추);
        재기("폰 너비에서 가로로 안 넘친다", !본.넘침, { 넘침: 본.넘침 });
        console.log(`     카드 글 — ${본.카드글}`);
      }
      if (본.카드) {
        await page.screenshot({ path: "engine/docs/ui-ask/두근-알림카드-실제.png" as `${string}.png` });
        console.log("     찍음: engine/docs/ui-ask/두근-알림카드-실제.png");
      }
    }
  } finally { await 창.browser.close(); await 창.close?.(); }
} catch (e) {
  나쁨++;
  console.log("실패", e instanceof Error ? e.message : String(e));
} finally {
  if (uid) { await svc.auth.admin.deleteUser(uid); console.log(`     시험 계정 지움 (${email})`); }
}
console.log(나쁨 === 0 ? "\n전부 통과" : `\n실패 ${나쁨}건`);
process.exit(나쁨 === 0 ? 0 : 1);
