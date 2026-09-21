import { openHeadless } from "@/lib/video/headless";

/**
 * **우리가 만든 것을 찍는다** (205회차 2026-09-21 밤).
 *
 * 로키는 영상을 만들 줄 알면서 **자기가 만든 것을 찍을 줄은 몰랐다.** 그래서 게임을 만들어 놓고도
 * 광고에는 영상 모델이 **지어낸** 게임 비슷한 장면을 넣게 된다 — 실제 제품이 아닌 것을 보여 주는 광고다.
 *
 * 이 함수가 그 구멍을 메운다. 산출물의 HTML 을 헤드리스로 띄우고, **진짜로 조작하고**, 녹화하고,
 * 앱 화면 자리를 **재서** 잘라 낸다. 취향이 안 들어가므로 기계가 할 수 있는 일이다
 * (무엇을 보여 줄지·좋은지는 사람 몫 — `engine/docs/genesis/ad-what-is-mechanical.md`).
 *
 * 값 0 — 모델을 안 부른다.
 */

export type CaptureOpts = {
  /** 어느 산출물을 찍는가. 출처로 기록에 남는다. */
  sourceDeliverableId?: string | null;
  /** 화면 크기. 기본 1280×720. */
  width?: number;
  height?: number;
  /** 몇 초 찍나. 기본 9초. */
  seconds?: number;
  /**
   * 무엇을 누르나. 기본은 **오른쪽으로 달리며 일정 간격 점프** — 플랫포머에 맞는다.
   * 게임마다 다르므로 부르는 쪽이 준다.
   */
  drive?: "runRight" | "tapCenter" | "keysOnly" | "none";
  /** 점프(또는 누르기) 간격(ms). 기본 620. */
  everyMs?: number;
};

export type CaptureResult = {
  /**
   * **이 클립의 이름표** (사장님 09-21). 조립할 때 "이 장면이 진짜 화면인가" 를 **판정하지 않고 계산**하려면
   * 재료에 이름이 붙어 있어야 한다. `videoMake` 가 클립별로 몇 초 썼는지 더하면 그게 답이다.
   * 완성 영상을 보고 "이게 실제 화면 같나" 를 묻는 순간, 애매한 것을 다시 기계에 맡기게 된다.
   */
  clipId: string;
  /** 어느 산출물을 찍은 것인가. 출처를 재료에 붙여 둔다. */
  sourceDeliverableId: string | null;
  /** 녹화된 webm 파일 경로 */
  path: string;
  /** 잘라 낼 자리 — ffmpeg `crop=w:h:x:y` 에 그대로 쓴다. 못 재면 null(화면 전체를 쓴다). */
  crop: { x: number; y: number; w: number; h: number } | null;
  seconds: number;
  /** 콘솔 오류. 녹화가 멀쩡했는지 보는 용도 */
  consoleErrors: string[];
};

/** 앱 화면(캔버스를 감싼 상자)의 자리를 **재서** 돌려준다. 눈대중이 아니다. */
const MEASURE = `(() => {
  const c = document.querySelector('canvas');
  // **머리로 돌아가지 않는다.** 자가 잡았다: 캐노스가 없는 쪽지에서 몸통을 재면
  // 앱이 아닌 것도 앱처럼 잘라 낸다. **재는 것이 없으면 null 이 맞다.**
  const el = (c && c.parentElement) || c || document.querySelector('main,.gamebox,#app');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r || r.width < 80 || r.height < 60) return null;
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
})()`;

export async function captureApp(html: string, outPath: string, opts: CaptureOpts = {}): Promise<CaptureResult> {
  const width = opts.width ?? 1280, height = opts.height ?? 720;
  const seconds = opts.seconds ?? 9;
  const drive = opts.drive ?? "runRight";
  const everyMs = opts.everyMs ?? 620;
  const errors: string[] = [];
  const ffmpegPath = ((await import("ffmpeg-static")) as unknown as { default: string }).default;
  const hl = await openHeadless({ width, height });
  if (!hl) throw new Error("브라우저가 없다 — 녹화할 수 없다");
  try {
    const page = await hl.browser.newPage();
    await page.setViewport({ width, height });
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
    page.on("pageerror", (e) => errors.push(String(e.message ?? e).slice(0, 160)));
    await page.setContent(html, { waitUntil: "load" });
    await new Promise((r) => setTimeout(r, 600));
    const crop = (await page.evaluate(MEASURE)) as CaptureResult["crop"];

    const rec = await page.screencast({ path: outPath as `${string}.webm`, ffmpegPath });
    const until = Date.now() + seconds * 1000;
    if (drive === "runRight") await page.keyboard.down("ArrowRight");
    while (Date.now() < until) {
      if (drive === "runRight" || drive === "keysOnly") await page.keyboard.press("Space");
      else if (drive === "tapCenter") await page.mouse.click(Math.round(width / 2), Math.round(height / 2));
      await new Promise((r) => setTimeout(r, everyMs));
    }
    if (drive === "runRight") await page.keyboard.up("ArrowRight");
    await new Promise((r) => setTimeout(r, 300));
    await rec.stop();
    const clipId = `clip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    return { clipId, sourceDeliverableId: opts.sourceDeliverableId ?? null, path: outPath, crop, seconds, consoleErrors: errors };
  } finally { await hl.close(); }
}

/**
 * 잰 자리를 **원하는 비율로 다듬는다**. 기본 16:9, 세로 광고면 `9/16` 을 준다.
 *
 * **잘라 낸 몫을 같이 돌려준다**(사장님 09-21): 세로형이나 4:3 게임을 16:9 로 맞추면 화면 일부가 날아간다.
 * 몇 %를 잘랐는지 기록에 없으면 **핵심 조작 부분이 잘린 영상도 형식 검사를 통과한다.**
 */
export function cropToAspect(c: CaptureResult["crop"], aspect = 16 / 9): { crop: CaptureResult["crop"]; cutRatio: number } {
  if (!c) return { crop: null, cutRatio: 0 };
  const area = c.w * c.h;
  let w = c.w, h = Math.round(c.w / aspect);
  if (h > c.h) { h = c.h; w = Math.round(c.h * aspect); }
  const crop = { x: c.x + Math.round((c.w - w) / 2), y: c.y + Math.round((c.h - h) / 2), w, h };
  return { crop, cutRatio: area > 0 ? Number((1 - (w * h) / area).toFixed(3)) : 0 };
}
