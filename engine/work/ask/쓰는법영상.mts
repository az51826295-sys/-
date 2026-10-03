/**
 * **로키 쓰는 법 — 화면을 찍는다** (228회차 10-03, 사장님 "로키 쓰는 법 니가 영상 찍어"). 모델 0 · 값 0.
 *   npx tsx engine/work/ask/쓰는법영상.mts
 *
 * ## 진짜 일을 안 돌린다
 * 끝까지 진짜로 시키면 값이 나간다(사장님 "돈 이제 쓰면 안돼"). 그래서 **화면 흐름만** 찍고,
 * 일하는 중 모양은 `?시연=1`(가짜)로 보여 준다. **어디가 가짜인지 영상 안에 적는다** —
 * 안 적으면 보는 사람이 "이렇게 돌았다" 고 믿는다.
 *
 * ## 자막은 화면 안에 넣는다
 * 영상만 주면 무엇을 보라는 건지 모른다. 각 칸마다 한 줄씩 띄운다.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import ffmpegPath from "ffmpeg-static";
import { openHeadless } from "../../../src/lib/video/headless";

const 나온칸 = "C:/Users/az518/Desktop/로키-쓰는법";
const 임시 = "C:/Users/az518/AppData/Local/Temp/로키-쓰는법-장면";
const FF = ffmpegPath as unknown as string;
if (!FF || !existsSync(FF)) { console.error("ffmpeg 을 못 찾았다"); process.exit(1); }
mkdirSync(나온칸, { recursive: true });
if (existsSync(임시)) rmSync(임시, { recursive: true, force: true });
mkdirSync(임시, { recursive: true });

const W = 1100, H = 760, FPS = 12;
const 창 = await openHeadless({ width: W, height: H });
if (!창) { console.error("창을 못 띄웠다"); process.exit(1); }
const page = await 창.browser.newPage();
await page.setViewport({ width: W, height: H });

/** 화면 위에 한 줄 띄운다. 가짜인 칸은 `가짜: true` 로 표시해 영상 안에서 밝힌다. */
async function 자막(글: string, 가짜 = false) {
  await page.evaluate(`(() => {
    let d = document.getElementById("rk-자막");
    if (!d) {
      d = document.createElement("div");
      d.id = "rk-자막";
      d.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:99999;padding:14px 18px;" +
        "background:rgba(10,10,10,.92);color:#fff;font:600 16px/1.5 Malgun Gothic,sans-serif;" +
        "border-top:2px solid #E0703A;letter-spacing:.2px";
      document.body.appendChild(d);
    }
    d.innerHTML = ${JSON.stringify(글)} + (${가짜 ? "true" : "false"}
      ? '<span style="margin-left:10px;padding:2px 7px;border-radius:5px;background:#5a1d1d;color:#ffb4b4;font-size:12px">이 칸은 가짜(시연)</span>' : '');
  })()`);
}

let n = 0;
const 찍기 = async (초: number) => {
  for (let i = 0; i < Math.round(초 * FPS); i++) {
    writeFileSync(`${임시}/${String(n++).padStart(4, "0")}.png`, Buffer.from(await page.screenshot({ type: "png" })));
    await new Promise((r) => setTimeout(r, 1000 / FPS - 55 > 0 ? 1000 / FPS - 55 : 0));
  }
};

// ── ① 처음 화면 ─────────────────────────────────────────
await page.goto("http://localhost:3000/ask", { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 1200));
await 자막("① 로키는 대화창 하나입니다. 무엇을 시킬지 모르면 아래 보기를 누르세요.");
await 찍기(3);

// ── ② 보기를 누르면 입력칸에 들어간다 ─────────────────────
await page.evaluate(`(() => {
  const b = [...document.querySelectorAll(".rk-예시 button")].find(x => x.innerText.includes("게임"));
  if (b) b.click();
})()`);
await 자막("② 보기를 누르면 **입력칸에 들어갑니다**. 바로 안 보냅니다 — 고쳐서 보내세요.");
await 찍기(3.5);

// ── ③ 보내면 — 대화 중 ──────────────────────────────────
await page.goto("http://localhost:3000/ask?시연=1", { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 2800));
await 자막("③ 보내면 로키가 답을 씁니다. 몇 초짜리라 얼굴과 띠만 바뀝니다.", true);
await 찍기(3);

// ── ④ 일을 맡으면 — 화면 전체가 빨개진다 ────────────────
await new Promise((r) => setTimeout(r, 2600));
await 자막("④ 시간이 드는 일은 업무로 맡습니다. 그때는 화면 테두리가 빨개지고 몇 분째인지 보입니다.", true);
await 찍기(4);

// ── ⑤ 켜 두고 쓰는 좁은 창 ──────────────────────────────
await page.goto("http://localhost:3000/ask?창=작게", { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 1500));
await 자막("⑤ 문자 띄워 놓듯 켜 두려면 '좁게'. '창으로 띄우기' 를 누르면 작은 창이 따로 뜹니다.");
await 찍기(3.5);

// ── ⑥ 설정 ─────────────────────────────────────────────
await page.goto("http://localhost:3000/ask", { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(`(() => {
  const b = [...document.querySelectorAll("button")].find(x => (x.getAttribute("aria-label")||"") === "설정");
  if (b) b.click();
})()`);
await 자막("⑥ 왼쪽 위 톱니 — 로그인, 크레딧, 폰으로 이어하기가 여기 있습니다.");
await 찍기(3.5);

await 창.close();

const 결과 = `${나온칸}/로키-쓰는법.mp4`;
execFileSync(FF, ["-y", "-framerate", String(FPS), "-i", `${임시}/%04d.png`,
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "22", "-movflags", "+faststart", 결과],
  { stdio: ["ignore", "ignore", "pipe"] });
const ffprobe = (await import("ffprobe-static")).default as unknown as { path: string };
const j = JSON.parse(execFileSync(ffprobe.path, ["-v", "quiet", "-print_format", "json", "-show_format", 결과]).toString()) as { format: { duration: string; size: string } };
console.log(`${Number(j.format.duration).toFixed(1)}초 · ${(Number(j.format.size) / 1048576).toFixed(1)}MB → ${결과}`);
rmSync(임시, { recursive: true, force: true });
