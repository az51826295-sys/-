/**
 * **캐릭터 넷을 다시 만든다** (226회차 2026-09-27, 사장님 "다시").
 *
 * 각자의 지금 그림을 참조로 시트를 새로 그리고, 본체 `cutSheet`(로키가 쓴 것)으로 자르고,
 * 자 다섯에 댄다. 통과 못한 캐릭터는 **다시 그린다**(최대 3판) — 같은 주문에도 판마다 결과가
 * 달라서(09-27 실측 0.937/0.942/0.973) 한 판만 뽑는 것은 운에 맡기는 일이다.
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/dot_remake_all.mts [--run]
 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const RUN = process.argv.includes("--run");
const REF = "C:/Users/az518/Desktop/도트-참조";
const OUT = "C:/Users/az518/Desktop/도트-새캐릭터";
const slugs = fs.readdirSync(REF).filter((f) => f.endsWith(".png")).map((f) => f.replace(".png", ""));
console.log(`캐릭터 ${slugs.length}: ${slugs.join(", ")}`);
if (!RUN) { console.log("\n--run 을 붙이면 그린다(캐릭터당 $0.05, 다시 그리면 더)."); process.exit(0); }

const sh = (args: string[]) => execFileSync("npx", args, { encoding: "utf8", shell: true, timeout: 900_000 });
const results: { slug: string; tries: number; ok: boolean; line: string }[] = [];

for (const slug of slugs) {
  let ok = false, tries = 0, line = "";
  while (!ok && tries < 3) {
    tries++;
    const dir = `${OUT}/${slug}`;
    fs.rmSync(dir, { recursive: true, force: true });
    try {
      sh(["tsx", "engine/tools/rookery_env.mts", "engine/tools/dot_redraw_same.mts", `${REF}/${slug}.png`, dir, "--run"]);
    } catch (e) { console.log(`  ${slug} ${tries}판 그리기 실패`); continue; }
    // 본체 cutSheet 은 dot_redraw_same 안에서 이미 돌았다 — 여기서는 자만 댄다.
    let out = "";
    try { out = sh(["tsx", "engine/tools/dot_shape_check.mts", dir]); } catch (e) { out = String((e as { stdout?: string }).stdout ?? ""); }
    const bg = /배경이 안 지워졌다/.test(out), fringe = /자국이 남았다/.test(out), pad = /여백 모자란 장 [1-9]/.test(out);
    const iou = Number(/가장 안 겹치는 짝: .*= ([0-9.]+)/.exec(out)?.[1] ?? 0);
    const face = Number(/얼굴 차이 ([0-9.]+)%/.exec(out)?.[1] ?? 0);
    ok = !bg && !fringe && !pad && iou >= 0.95 && face >= 15;
    line = `일관성 ${iou.toFixed(3)} · 표정 ${face.toFixed(1)}%${bg ? " · 배경✗" : ""}${fringe ? " · 마젠타✗" : ""}${pad ? " · 여백✗" : ""}`;
    console.log(`  ${slug} ${tries}판: ${line} ${ok ? "· **통과**" : "· 다시"}`);
  }
  results.push({ slug, tries, ok, line });
}

console.log(`\n=== 끝 ===`);
for (const r of results) console.log(`  ${r.slug.padEnd(8)} ${r.tries}판 ${r.ok ? "통과" : "**못 넘김**"} · ${r.line}`);
console.log(`\n${OUT} · 앱에 올리는 것은 사장님이 보시고 정한다.`);
