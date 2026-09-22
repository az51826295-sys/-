import sharp from "sharp";
import type { Page, KeyInput } from "puppeteer-core";
import { openHeadless } from "@/lib/video/headless";
import { measureWeb } from "@/lib/skills/appBuild/webMeasures";

/**
 * **웹 판을 실제로 돌려 본다** (179회차 09-18).
 *
 * 사장님: *"지피티는 발로란트 만들어줘 하면 1시간 동안 만들더라 — 고퀄로 가려면 이것도 해결할 문제네."*
 * 지피티가 한 시간 동안 하는 건 긴 답이 아니라 **만들고 → 돌려 보고 → 고치기를 수십 바퀴** 도는 것이다.
 * 우리는 여태 "돌려 보지 않는다"(verify.ts — 서버에서 임의 코드를 실행하면 회사 열쇠가 그 코드 안에 있다)였다.
 * 그래서 서버 프로세스가 아니라 **헤드리스 브라우저의 빈 창**에서 돌린다: 창 안의 코드는 서버의 환경변수·파일·DB 에 닿을 수 없고,
 * 바깥으로 나가는 요청은 전부 가로채 막는다(파일은 메모리에서 대 준다). 그래도 "안전하다" 가 아니라 "닿는 데가 없다" 다.
 *
 * 여기서 내는 것은 **사실**뿐이다 — 콘솔 오류, 첫 화면이 비었는가, 누르면/키를 치면 화면이 바뀌는가, 그림 두 장.
 * "됐다/안 됐다" 는 심판자(loop.ts)가 이 사실과 확인 목록을 놓고 정한다. 브라우저가 없으면 `ran:false` — 돌린 척하지 않는다.
 */
export type RunFacts = {
  ran: boolean;
  why?: string;
  ms: number;
  /** 콘솔 error + 잡히지 않은 예외. 같은 줄은 한 번만, 최대 12줄. */
  consoleErrors: string[];
  /** 첫 화면이 단색(거의 아무것도 안 그려짐)인가. */
  blankAtStart: boolean;
  /** 입력 없이 1.2초 동안 화면이 바뀌었나(움직임이 있나). */
  movesByItself: boolean;
  /** 가운데를 누른(터치/클릭) 뒤 화면이 바뀌었나. */
  changesOnTap: boolean;
  /** 방향키·스페이스를 친 뒤 화면이 바뀌었나. */
  changesOnKeys: boolean;
  /** 화면에 보이는 글자(앞 300자). 점수·타이머·버튼 글자를 심판자가 본다. */
  text: string;
  /** 화면 세 장(시작·시작 단추 누른 뒤·놀아 본 뒤), 작은 JPEG base64 — 심판자에게 보여 준다. 저장하지 않는다. */
  shots: { start: string; mid: string; after: string };
  /** 이번에 실제로 한 조작(사람 말). */
  did: string[];
  /**
   * **숫자로 잰 값**(205회차 09-22). 화면만 보는 심판은 점프 높이를 못 본다 —
   * 판 2 가 높이를 36% 떨어뜨리고도 통과한 자리가 여기였다. 못 잰 이름은 **아예 안 들어간다**(0 이 아니다).
   */
  measured?: Record<string, number>;
};

/**
 * 돌려 볼 때 하는 조작. 첫 바퀴는 기본 대본(시작 단추 → 캔버스 여기저기 누르기 → 키), 그다음 바퀴부터는 **심판자가 다음 대본을 준다**
 * ("게임 시작을 누르고 두더지가 나오면 그 자리를 눌러라") — 못 본 기준을 보려면 그 자리까지 가야 한다. 첫 시험에서 시작 화면만 보고 7개 전부 "모름" 이었다.
 */
export type RunAction =
  | { do: "click_text"; text: string }
  | { do: "tap"; x: number; y: number }          // 캔버스(없으면 화면) 안의 비율 0~1
  | { do: "taps"; n: number }                    // 캔버스 여기저기를 n 번 누른다(0.15초 간격)
  | { do: "taps_moving"; n: number }             // **움직이는/새로 나타난 것**을 n 번 누른다 — 두 장을 찍어 바뀐 자리를 누른다(두더지·떨어지는 것)
  | { do: "key"; key: string; ms?: number }
  | { do: "wait"; ms: number };

export const DEFAULT_ACTIONS: RunAction[] = [
  { do: "click_text", text: "시작|start|play|플레이|게임 시작" }, { do: "wait", ms: 800 },
  { do: "taps_moving", n: 6 }, { do: "taps", n: 6 }, { do: "key", key: "ArrowRight", ms: 250 }, { do: "key", key: "Space" }, { do: "key", key: "KeyD", ms: 200 }, { do: "wait", ms: 1200 },
];

/** 두 장 사이에 제일 많이 바뀐 자리(뷰포트 좌표). 32×18 칸으로 나눠 센다. 아무것도 안 바뀌었으면 null. */
async function hotSpot(a: Buffer, b: Buffer, width: number, height: number): Promise<{ x: number; y: number } | null> {
  const small = (x: Buffer) => sharp(x).resize(128, 72, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const [p, q] = await Promise.all([small(a), small(b)]);
  const cells = new Array<number>(32 * 18).fill(0);
  for (let y = 0; y < 72; y++) for (let x = 0; x < 128; x++) {
    const i = (y * 128 + x) * 3;
    if (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) > 30) cells[Math.floor(y / 4) * 32 + Math.floor(x / 4)]++;
  }
  let bi = -1, bv = 2;
  for (let i = 0; i < cells.length; i++) if (cells[i] > bv) { bv = cells[i]; bi = i; }
  if (bi < 0) return null;
  return { x: ((bi % 32) + 0.5) * (width / 32), y: (Math.floor(bi / 32) + 0.5) * (height / 18) };
}

type File = { path: string; contents: string; language?: string };

const MIME: Record<string, string> = { html: "text/html", htm: "text/html", js: "text/javascript", mjs: "text/javascript", css: "text/css", json: "application/json", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", txt: "text/plain" };

/** 들어갈 파일. index.html → 유일한 .html → 없으면 null(웹 판이 아니다). */
export function entryOf(files: File[]): File | null {
  const htmls = files.filter((f) => /\.html?$/i.test(f.path));
  return htmls.find((f) => /(^|\/)index\.html?$/i.test(f.path)) ?? htmls[0] ?? null;
}

/** 두 화면이 얼마나 다른가 — 256×144 로 줄여 픽셀 차이 비율. 0 이면 같다(헤드리스는 같은 화면을 같게 그린다). */
async function diff(a: Buffer, b: Buffer): Promise<number> {
  const small = (x: Buffer) => sharp(x).resize(256, 144, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const [p, q] = await Promise.all([small(a), small(b)]);
  let n = 0;
  for (let i = 0; i < p.length; i += 3) {
    if (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) > 30) n++;
  }
  return n / (p.length / 3);
}
/** 20px 글자 하나가 바뀌면 256 폭에서 픽셀 20개쯤(0.05%). 그때부터 "바뀜" 으로 본다 — 헤드리스는 같은 화면을 같게 그려서 0 과 구분된다. */
const CHANGED = 0.0005;

/** 단색인가 — 표준편차가 아주 작으면 아무것도 안 그려진 것. */
async function isBlank(png: Buffer): Promise<boolean> {
  const s = await sharp(png).resize(64, 36, { fit: "fill" }).removeAlpha().stats();
  return s.channels.every((c) => c.stdev < 4);
}

async function tinyJpeg(png: Buffer): Promise<string> {
  return (await sharp(png).resize({ width: 480 }).jpeg({ quality: 60 }).toBuffer()).toString("base64");
}

const shot = (page: Page) => page.screenshot({ type: "png" }) as Promise<Buffer>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runWeb(files: File[], opts: { mobile: boolean; width?: number; height?: number; timeoutMs?: number; actions?: RunAction[]; measures?: string[] }): Promise<RunFacts> {
  const t0 = Date.now();
  const none: RunFacts = { ran: false, ms: 0, consoleErrors: [], blankAtStart: false, movesByItself: false, changesOnTap: false, changesOnKeys: false, text: "", shots: { start: "", mid: "", after: "" }, did: [] };
  const did: string[] = [];
  const entry = entryOf(files);
  if (!entry) return { ...none, why: "HTML 파일이 없다" };
  const width = opts.width ?? (opts.mobile ? 820 : 1280), height = opts.height ?? (opts.mobile ? 1180 : 720);
  const hl = await openHeadless({ width, height, mobile: opts.mobile });
  if (!hl) return { ...none, why: "브라우저가 없다" };
  const errors = new Set<string>();
  const byPath = new Map(files.map((f) => [f.path.replace(/^\.?\//, ""), f]));
  const origin = "http://app.rookery.local";
  try {
    const page = await hl.browser.newPage();
    page.setDefaultTimeout(opts.timeoutMs ?? 15_000);
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.add(m.text().slice(0, 200)); });
    page.on("pageerror", (e) => errors.add(String(e.message ?? e).slice(0, 200)));
    // 모든 요청을 가로챈다: 우리 파일이면 메모리에서, 아니면 막는다. 바깥은 없다.
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const u = req.url();
      if (u.startsWith("data:") || u === "about:blank") { void req.continue(); return; }
      if (u.startsWith(origin)) {
        const p = decodeURIComponent(new URL(u).pathname.replace(/^\//, "")) || entry.path;
        const f = byPath.get(p) ?? (p === "index.html" ? entry : undefined);
        if (f) { const ext = p.split(".").pop()?.toLowerCase() ?? ""; const mime = MIME[ext] ?? "application/octet-stream"; void req.respond({ status: 200, contentType: mime.startsWith("text/") || mime.includes("javascript") || mime.includes("json") ? `${mime}; charset=utf-8` : mime, body: f.contents }); return; }
        // 브라우저가 알아서 찾는 favicon 은 없는 게 정상이다 — 오류로 세지 않는다.
        if (/favicon/i.test(p)) { void req.respond({ status: 204, contentType: "image/x-icon", body: "" }); return; }
        errors.add(`없는 파일 요청: ${p}`);
        void req.respond({ status: 404, contentType: "text/plain", body: "" }); return;
      }
      errors.add(`바깥 요청 막음: ${u.slice(0, 120)}`);
      void req.abort();
    });
    await page.goto(`${origin}/${entry.path.replace(/^\.?\//, "")}`, { waitUntil: "load" });
    await sleep(800);
    const s0 = await shot(page);
    await sleep(1200);
    const s1 = await shot(page);
    const movesByItself = (await diff(s0, s1)) > CHANGED;
    // 게임이 그려지는 곳을 누른다 — 제일 큰 canvas 가 있으면 그 가운데, 없으면 화면 가운데. (400×300 캔버스가 왼쪽 위에 있는데
    // 화면 가운데를 누르면 아무 데도 안 누른 것이다 — 첫 시험에서 그랬다.)
    const target = await page.evaluate(() => {
      const cs = [...document.querySelectorAll("canvas")].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 20 && r.height > 20);
      cs.sort((a, b) => b.width * b.height - a.width * a.height);
      const r = cs[0];
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    }).catch(() => null);
    const cx = Math.round(target?.x ?? width / 2), cy = Math.round(target?.y ?? height / 2);
    const press = async (x: number, y: number) => { if (opts.mobile) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); };
    const before = await shot(page);
    await press(cx, cy);
    await sleep(500);
    const afterTap = await shot(page);
    const changesOnTap = (await diff(before, afterTap)) > CHANGED;
    // 키: 오른쪽 둘·스페이스·D(왼쪽은 안 친다 — 오른쪽 뒤 왼쪽이면 제자리라 "안 바뀜" 이 나온다, 첫 시험). 게임이 키를 안 받으면(터치 전용) 안 바뀌는 게 정상 — 사실만 적는다.
    const b2 = await shot(page);
    for (const k of ["ArrowRight", "ArrowRight", "Space", "KeyD"] as const) { await page.keyboard.down(k); await sleep(120); await page.keyboard.up(k); }
    await sleep(400);
    const afterKeys = await shot(page);
    const changesOnKeys = (await diff(b2, afterKeys)) > CHANGED;

    // 대본대로 놀아 본다 — 시작 단추를 누르고, 캔버스 여기저기를 누르고, 키를 친다. 심판자가 준 대본이 있으면 그것.
    let mid: Buffer | null = null;
    const box = () => page.evaluate(() => {
      const cs = [...document.querySelectorAll("canvas")].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 20 && r.height > 20);
      cs.sort((a, b) => b.width * b.height - a.width * a.height);
      const r = cs[0]; return r ? { l: r.left, t: r.top, w: r.width, h: r.height } : null;
    }).catch(() => null);
    for (const act of (opts.actions ?? DEFAULT_ACTIONS).slice(0, 14)) {
      try {
        if (act.do === "click_text") {
          const re = new RegExp(act.text, "i");
          const hit = await page.evaluate((src) => {
            const re = new RegExp(src, "i");
            const els = [...document.querySelectorAll("button, a, [role=button], div, span, p, h1, h2, h3")] as HTMLElement[];
            const el = els.find((e) => e.children.length === 0 && re.test(e.textContent ?? "") && e.getBoundingClientRect().width > 0) ?? els.find((e) => re.test(e.textContent ?? "") && e.getBoundingClientRect().width > 0);
            if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: (el.textContent ?? "").trim().slice(0, 30) };
          }, re.source);
          if (hit) { await press(Math.round(hit.x), Math.round(hit.y)); did.push(`'${hit.text}' 누름`); await sleep(600); if (!mid) mid = await shot(page); }
          else did.push(`'${act.text}' 글자 없음`);
        } else if (act.do === "taps_moving") {
          let n = 0;
          for (let i = 0; i < Math.min(act.n, 12); i++) {
            const a = await shot(page); await sleep(250); const b = await shot(page);
            const h = await hotSpot(a, b, width, height);
            if (h) { await press(Math.round(h.x), Math.round(h.y)); n++; }
            await sleep(150);
          }
          did.push(`움직이는 자리 ${n}번 누름`);
        } else if (act.do === "tap") {
          // 1 보다 크면 픽셀로 준 것이다(심판자가 그렇게 주기도 했다) — 화면 좌표로 본다.
          const b = await box(); const px = act.x > 1 || act.y > 1;
          const x = px ? act.x : b ? b.l + b.w * act.x : width * act.x, y = px ? act.y : b ? b.t + b.h * act.y : height * act.y;
          await press(Math.round(Math.min(width - 1, x)), Math.round(Math.min(height - 1, y))); did.push(px ? `(${Math.round(x)},${Math.round(y)}) 누름` : `(${Math.round(act.x * 100)}%,${Math.round(act.y * 100)}%) 누름`); await sleep(200);
        } else if (act.do === "taps") {
          const b = await box(); let n = 0;
          for (let i = 0; i < Math.min(act.n, 20); i++) {
            const fx = 0.15 + 0.7 * ((i * 0.618) % 1), fy = 0.15 + 0.7 * ((i * 0.382 + 0.3) % 1);
            const x = b ? b.l + b.w * fx : width * fx, y = b ? b.t + b.h * fy : height * fy;
            await press(Math.round(x), Math.round(y)); n++; await sleep(150);
          }
          did.push(`화면 여기저기 ${n}번 누름`);
        } else if (act.do === "key") {
          const key = act.key as KeyInput; await page.keyboard.down(key); await sleep(act.ms ?? 120); await page.keyboard.up(key); did.push(`${act.key} 키`); await sleep(150);
        } else if (act.do === "wait") { const ms = Math.min(act.ms, 25_000); await sleep(ms); did.push(`${Math.round(ms / 100) / 10}초 기다림`); }
      } catch (e) { did.push(`조작 실패: ${e instanceof Error ? e.message.slice(0, 60) : String(e)}`); }
    }
    const end = await shot(page);
    const text = await page.evaluate(() => (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 300)).catch(() => "");
    const blankAtStart = await isBlank(s0);
    // **놀아 본 뒤에 잰다** — 시작 단추를 눌러 게임이 도는 상태여야 점프를 잴 수 있다.
    const measured = opts.measures?.length ? await measureWeb(page, opts.measures).catch(() => ({})) : undefined;
    return {
      ran: true, ms: Date.now() - t0, measured,
      consoleErrors: [...errors].slice(0, 12),
      blankAtStart, movesByItself, changesOnTap, changesOnKeys, text, did,
      shots: { start: await tinyJpeg(s0), mid: await tinyJpeg(mid ?? afterKeys), after: await tinyJpeg(end) },
    };
  } catch (e) {
    return { ...none, ran: true, ms: Date.now() - t0, consoleErrors: [...errors, `돌리다 막힘: ${e instanceof Error ? e.message : String(e)}`].slice(0, 12) };
  } finally {
    await hl.close();
  }
}

/** 심판자·사람에게 보여 줄 한 줄들. 그림은 뺀다. */
export function factLines(f: RunFacts): string[] {
  if (!f.ran) return [`돌려 보지 못함(${f.why ?? "이유 없음"})`];
  return [
    `콘솔 오류 ${f.consoleErrors.length}개${f.consoleErrors.length ? ": " + f.consoleErrors.slice(0, 4).join(" | ") : ""}`,
    `첫 화면 ${f.blankAtStart ? "비어 있음(단색)" : "그려짐"}`,
    `가만히 두면 ${f.movesByItself ? "움직임" : "안 움직임"}`,
    `가운데를 누르면 ${f.changesOnTap ? "화면이 바뀜" : "안 바뀜"}`,
    `방향키·스페이스를 치면 ${f.changesOnKeys ? "화면이 바뀜" : "안 바뀜"}`,
    `해 본 조작: ${f.did.join(" → ") || "(없음)"}`,
    `놀아 본 뒤 화면 글자: ${f.text || "(없음)"}`,
    ...(f.measured && Object.keys(f.measured).length
      ? [`숫자로 잰 값: ${Object.entries(f.measured).map(([k, v]) => `${k}=${v}`).join(" · ")}`]
      : []),
  ];
}
