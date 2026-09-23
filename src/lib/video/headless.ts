import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import puppeteer, { type Browser } from "puppeteer-core";
import { browserPath } from "./screen";

/**
 * 헤드리스 브라우저 하나를 띄워서 넘긴다 (179회차 09-18).
 *
 * `screen.ts`(영상 촬영)가 쓰던 띄우는 법을 그대로 뗀 것 — `puppeteer.launch` 는 엣지에서 말없이 죽어서(152회차)
 * 우리가 직접 띄우고 포트로 붙는다. 서버(Railway)의 크로뮴도 같은 길. 브라우저가 없으면 **던지지 않고 null** —
 * 부르는 쪽이 "못 돌려 봤다" 로 적는다.
 */
export async function openHeadless(opts?: { width?: number; height?: number; mobile?: boolean }): Promise<{ browser: Browser; close: () => Promise<void> } | null> {
  const exe = browserPath();
  if (!exe) return null;
  const width = opts?.width ?? 1280, height = opts?.height ?? 720;
  const profile = await mkdtemp(path.join(tmpdir(), "rk-hl-"));
  const port = 9300 + Math.floor(Math.random() * 400);
  const proc = spawn(exe, [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
    `--window-size=${width},${height}`, "--force-device-scale-factor=1", "--lang=ko-KR", "--hide-scrollbars",
    // 만든 코드가 도는 창이다: 바깥으로 나가는 길을 브라우저 차원에서도 막는다(요청 가로채기가 첫 문, 이것이 둘째 문).
    "--disable-extensions", "--disable-background-networking", "--disable-sync", "--no-first-run",
    `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, "about:blank",
  ], { stdio: "ignore", detached: false });
  let ws = "";
  for (let i = 0; i < 60 && !ws; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) ws = ((await r.json()) as { webSocketDebuggerUrl?: string }).webSocketDebuggerUrl ?? "";
    } catch { /* 아직 */ }
  }
  if (!ws) {
    // **왜 못 열었는지 말한다**(205회차 09-23). "브라우저 없음" 한 마디로는 실행 파일이 없는지,
    // 떴는데 답이 없는지(기계가 꽉 찼을 때 — CPU 100% · 남은 메모리 671MB 에서 실제로 그랬다) 못 가른다.
    console.warn(`[헤드리스] 30초 동안 포트 ${port} 응답 없음 · 프로세스 ${proc.exitCode == null ? "살아 있음(답만 없음 — 기계가 꽉 찼을 가능성)" : `죽음(exit ${proc.exitCode})`} · ${exe}`);
    try { proc.kill(); } catch { /* */ }
    await rm(profile, { recursive: true, force: true }).catch(() => {});
    return null;
  }
  const browser = await puppeteer.connect({
    browserWSEndpoint: ws,
    defaultViewport: { width, height, isMobile: !!opts?.mobile, hasTouch: !!opts?.mobile, deviceScaleFactor: 1 },
  });
  const close = async () => {
    try { await browser.close(); } catch { /* */ }
    try { proc.kill(); } catch { /* */ }
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  };
  return { browser, close };
}
