import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";
import { bins } from "./assemble";

const run = promisify(execFile);
const BS = String.fromCharCode(92);
const NL = String.fromCharCode(10);
const Q = String.fromCharCode(39);
/** 윈도우 경로를 ffmpeg 이 읽는 모양으로. */
const fwd = (p: string) => p.split(BS).join("/");


/**
 * **로키가 자기 화면을 찍는다** (154회차 09-16).
 *
 * 사장님: *"에휴 쓰레기"* — 광고를 세 판째 글자 카드로 냈다. 원인은 하나였다:
 * **로키의 영상 배관에 그림이 글자 카드 한 가지뿐**이었고, 나는 그 위에 조판(149)과 움직임(153)만 얹었다.
 * 광고를 못 만드는 배관에 광고를 시킨 것이다.
 *
 * 144회차에 **내가 연장통에서** 진짜 화면을 찍어 광고를 만든 적이 있다. 그때 사장님이 하신 말이
 * *"로키를 정말 잘만들었다면 이런일이 안생겼다"* 였다. 그래서 그 능력을 **로키 안으로** 옮긴다.
 *
 * 지어낸 그림이 아니다. 진짜 로키를 진짜 브라우저로 열어서 찍는다 — 그래서 "AI 광고 특유의 어색함" 이 없다.
 * 없는 기능을 보여 줄 수도 없다(찍히는 것이 곧 사실이다).
 */

/** 찍을 수 있는 장면. **대본이 고른다** — 어느 장면을 어디에 쓸지는 판단이지 내 표가 아니다. */
export const BEATS = {
  주문침: "빈 대화창에 주문을 한 글자씩 쳐 넣는 장면. 광고의 첫 3초에 어울린다.",
  보냄: "보내기를 눌러 일이 시작되는 장면.",
  도는중: "사람이 붙고 일이 도는 동안의 화면.",
  결과: "결과물과 파일이 대화에 붙은 화면.",
} as const;
export type Beat = keyof typeof BEATS;
export const isBeat = (s: string): s is Beat => Object.prototype.hasOwnProperty.call(BEATS, s);

/** 크로뮴을 찾는다. 서버는 apt 로 깔린 것, 내 기계는 엣지 — 없으면 **던지지 않고** null 이다(글자 카드로 돌아간다). */
export function browserPath(): string | null {
  const cands = [
    process.env.CHROMIUM_PATH ?? "",
    "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  ].filter(Boolean);
  return cands.find((c) => existsSync(c)) ?? null;
}

type Clip = { beat: Beat; mp4: Buffer };

/**
 * 한 번 열어서 **여러 장면을 이어 찍는다**(로그인 한 번, 판 하나).
 *
 * 찍는 법: 초당 12장씩 화면을 떠서 ffmpeg 으로 붙인다. CDP 녹화보다 느리지만 어디서나 같게 돈다.
 * 실패하면 **던지지 않는다** — 찍힌 것만 돌려준다. 광고가 못 나오는 것보다 글자 카드가 낫다.
 */
export async function recordRookery(opts: {
  site: string; supabaseUrl: string; anonKey: string; email: string; password: string;
  order: string; want: Beat[]; fps?: number;
}): Promise<Clip[]> {
  const exe = browserPath();
  if (!exe) { console.warn("[화면] 브라우저가 없다 — 화면 녹화를 건너뛴다"); return []; }
  const { createClient } = await import("@supabase/supabase-js");
  const anon = createClient(opts.supabaseUrl, opts.anonKey);
  const { data: sess, error } = await anon.auth.signInWithPassword({ email: opts.email, password: opts.password });
  if (error || !sess.session) { console.warn("[화면] 촬영용 계정으로 못 들어갔다 — 건너뛴다"); return []; }
  const s = sess.session;
  const ref = new URL(opts.supabaseUrl).hostname.split(".")[0];
  const cookieValue = "base64-" + Buffer.from(JSON.stringify({
    access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at,
    expires_in: s.expires_in, token_type: s.token_type, user: s.user,
  })).toString("base64url");

  const fps = opts.fps ?? 12;
  const dir = await mkdtemp(path.join(tmpdir(), "screen-"));
  const { ffmpeg: FFMPEG } = await bins();
  const out: Clip[] = [];
  /**
   * **브라우저는 우리가 띄우고, 붙기만 한다.**
   *
   * `puppeteer.launch` 는 자기 방식으로 인자를 붙이는데 그게 엣지(152)와 안 맞아 **아무 말 없이 즉시 죽었다**
   * (stderr 한 줄도 없다). 같은 엣지를 손으로 띄우면 CDP 가 멀쩡히 뜬다. 그래서 띄우는 것은 우리가 하고
   * 주소만 받아 붙는다 — 서버의 크로뮴에서도 같은 길로 돈다(실행기 사정에 안 끌려다닌다).
   */
  const profile = await mkdtemp(path.join(tmpdir(), "rk-prof-"));
  // 포트를 정해 두고 **HTTP 로 물어서** 붙는다. stderr 의 "DevTools listening on …" 을 기다렸더니
  // 윈도우의 엣지는 자기를 다시 띄우고 **부모가 코드 0 으로 즉시 끝나** 그 줄이 안 온다(손으로 띄우면 CDP 는 멀쩡히 산다).
  // 그래서 부모가 끝나는 것은 고장이 아니다 — 포트가 응답하는지만 본다.
  const port = 9300 + Math.floor(Math.random() * 400);
  const proc = spawn(exe, [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
    "--window-size=1280,720", "--force-device-scale-factor=1", "--lang=ko-KR", "--hide-scrollbars",
    `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, "about:blank",
  ], { stdio: "ignore", detached: false });
  let wsEndpoint = "";
  for (let i = 0; i < 60 && !wsEndpoint; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) wsEndpoint = ((await r.json()) as { webSocketDebuggerUrl?: string }).webSocketDebuggerUrl ?? "";
    } catch { /* 아직 안 떴다 */ }
  }
  if (!wsEndpoint) { proc.kill(); console.warn("[화면] 브라우저가 30초 안에 안 떴다 — 건너뛴다"); return []; }
  const browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint, defaultViewport: { width: 1280, height: 720 } });
  try {
    const page = await browser.newPage();
    await page.setCookie({ name: `sb-${ref}-auth-token`, value: cookieValue, domain: new URL(opts.site).hostname, path: "/", httpOnly: false, secure: true });

    /** 한 장면을 seconds 초 동안 찍는다. 찍는 동안 `during` 이 화면을 움직인다. */
    const record = async (beat: Beat, seconds: number, during?: () => Promise<void>) => {
      const shots: string[] = [];
      let stop = false;
      const loop = (async () => {
        const started = Date.now();
        for (let i = 0; !stop && Date.now() - started < seconds * 1000; i++) {
          const p = path.join(dir, `${beat}-${String(i).padStart(4, "0")}.png`);
          try { await page.screenshot({ path: p as `${string}.png` }); shots.push(p); } catch { break; }
          await new Promise((r) => setTimeout(r, Math.max(0, 1000 / fps - 45)));
        }
      })();
      if (during) { try { await during(); } catch { /* 움직이다 실패해도 찍힌 것은 쓴다 */ } }
      await loop; stop = true;
      if (shots.length < 4) return;
      const listFile = path.join(dir, `${beat}.txt`);
      await writeFile(
        listFile,
        shots.map((q) => "file " + Q + fwd(q) + Q + NL + "duration " + (1 / fps).toFixed(4)).join(NL) +
          NL + "file " + Q + fwd(shots[shots.length - 1]) + Q + NL,
      );
      const mp4 = path.join(dir, `${beat}.mp4`);
      await run(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-vf", "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-r", "30", mp4]);
      out.push({ beat, mp4: await readFile(mp4) });
    };

    await page.goto(`${opts.site}/ask`, { waitUntil: "networkidle2", timeout: 120_000 });
    await new Promise((r) => setTimeout(r, 2500));

    if (opts.want.includes("주문침")) {
      const box = await page.waitForSelector("textarea", { timeout: 30_000 }).catch(() => null);
      if (box) await record("주문침", 3.2, async () => { await box.click(); await page.keyboard.type(opts.order, { delay: 55 }); });
    }
    if (opts.want.includes("보냄")) {
      await record("보냄", 1.6, async () => {
        await page.evaluate(() => {
          const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === "보내기");
          (b as HTMLButtonElement | undefined)?.click();   // 합성 클릭은 React 에 안 잡힌다(144회차) — 진짜 click() 을 부른다
        });
        await new Promise((r) => setTimeout(r, 1200));
      });
    }
    if (opts.want.includes("도는중")) await record("도는중", 2.4, async () => { await new Promise((r) => setTimeout(r, 2400)); });
    if (opts.want.includes("결과")) {
      // 이미 끝나 있는 지난 판을 보여 준다 — 광고 한 판 찍자고 새 일이 끝날 때까지 기다리지 않는다.
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
      await record("결과", 2.4, async () => { await new Promise((r) => setTimeout(r, 2400)); });
    }
  } catch (e) {
    console.warn("[화면] 찍다가 멈췄다 — 찍힌 것만 쓴다:", e instanceof Error ? e.message : e);
  } finally {
    await browser.close().catch(() => {});
    proc.kill();
  }
  console.log(`[화면] ${out.length}컷 찍음: ${out.map((c) => c.beat).join(", ")}`);
  return out;
}
