/**
 * **로키가 자기 화면을 찍는가** (154회차 09-16). 돈 0, 모델 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/screen_probe.mts
 *
 * 사장님 "에휴 쓰레기" — 광고를 세 판째 글자 카드로 냈다. 배관에 그림이 글자 카드뿐이라서다.
 * 이 자는 그 배관에 **진짜 화면**이 들어오는지 본다: 찍히나 · 움직이나 · 그 위에 글이 얹히나.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
const { recordRookery, browserPath } = await import("../../src/lib/video/screen");
const { assemble, bins } = await import("../../src/lib/video/assemble");
const { safeLook } = await import("../../src/lib/video/look");

let bad = 0;
const check = (n: string, ok: boolean, got?: unknown) => { if (!ok) bad++; console.log(ok ? "통과" : "실패", n, ok ? "" : JSON.stringify(got)); };

console.log("브라우저:", browserPath() ?? "(없음)");
const clips = await recordRookery({
  site: process.env.ROOKERY_SITE ?? "https://rookery-web-production.up.railway.app",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  email: "demo-rookery@rookery.local",
  password: "Rookery-Demo-2026!aA",
  order: "우리 제품 15초 광고 만들어 줘",
  want: ["주문침", "도는중", "결과"],
});
check("화면이 찍혔다", clips.length >= 2, clips.map((c) => c.beat));
if (!clips.length) { console.log("찍힌 게 없어 여기서 멈춘다"); process.exit(1); }

const { ffmpeg: FF } = await bins();
const out = "C:/Users/az518/AppData/Local/Temp";
for (const c of clips) {
  const f = path.join(out, `beat-${c.beat}.mp4`);
  await writeFile(f, c.mp4);
  const a = path.join(out, `beat-${c.beat}-a.png`), b = path.join(out, `beat-${c.beat}-b.png`);
  await run(FF, ["-y", "-ss", "0.2", "-i", f, "-frames:v", "1", a]);
  await run(FF, ["-y", "-ss", "1.4", "-i", f, "-frames:v", "1", b]);
  const { stderr } = await run(FF, ["-hide_banner", "-i", a, "-i", b, "-lavfi", "psnr", "-f", "null", "-"]).catch((e) => ({ stderr: String(e.stderr ?? "") }));
  const m = /average:([0-9.]+|inf)/.exec(String(stderr));
  const v = !m ? 0 : m[1] === "inf" ? 999 : Number(m[1]);
  console.log(`  ${c.beat}: ${(c.mp4.length / 1024).toFixed(0)}KB · 0.2초↔1.4초 PSNR ${v.toFixed(1)}`);
  if (c.beat === "주문침") check("   주문 치는 장면은 실제로 움직인다", v < 45, v);
}

// 그 위에 글을 얹어 본다 — 배관 끝까지.
const sil = path.join(out, "sil.mp3");
await run(FF, ["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "2.4", sil]);
const { readFile } = await import("node:fs/promises");
const audio = await readFile(sil);
const v = await assemble(
  clips.slice(0, 3).map((c, i) => ({
    title: i === 0 ? "카드 없이 바로 써보세요" : i === 1 ? "말하면 사람이 붙어요" : "파일로 돌려드려요",
    lines: [], caption: "", audio, clip: c.mp4,
  })),
  { look: safeLook({ motion: "rise", transition: "fade", titleScale: 0.11 }), padSec: 0.2 },
);
const final = path.join(out, "screen-test.mp4");
await writeFile(final, v.mp4);
check("찍은 화면 위에 글을 얹어 영상이 나온다", v.mp4.length > 50_000 && v.total > 3, { kb: Math.round(v.mp4.length / 1024), total: v.total });
console.log(`\n${final} · ${v.total.toFixed(1)}초`);
console.log(bad ? `${bad}건 실패` : "전부 통과");
