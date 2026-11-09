/** 지금 사진을 잰다 — 기준을 정하기 전에 **있는 것의 숫자**부터. */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
const sharp = (await import("sharp")).default;

const 사람 = ["doyun", "haru", "jiwoo", "nabi", "rin", "seoha", "soeun", "taeo", "yeonu", "yuna"];
function 도트재기(paths: string[]): (number | null)[] {
  if (!paths.length) return [];
  const py = [
    "import sys, json", "sys.path.insert(0, 'engine/genesis')", "import texel_judge as T",
    `paths = ${JSON.stringify(paths)}`,
    "print(json.dumps([T.measure_one(p).get('texel') for p in paths]))",
  ].join(String.fromCharCode(10));
  return JSON.parse(execFileSync("python", ["-c", py], { encoding: "utf8", cwd: process.cwd() }).trim().split(String.fromCharCode(10)).pop()!);
}

const 길: string[] = [];
for (const s of 사람) {
  const d = `public/dot-sprites/${s}/photo`;
  if (!existsSync(d)) continue;
  for (const f of readdirSync(d)) if (f.endsWith(".png")) 길.push(`${d}/${f}`);
}
const 도트 = 도트재기(길);
const 크기 = new Map<string, number>(), 색 = new Map<number, number>(), 도트수 = new Map<string, number>();
for (const [i, p] of 길.entries()) {
  const m = await sharp(p).metadata();
  크기.set(`${m.width}x${m.height}`, (크기.get(`${m.width}x${m.height}`) ?? 0) + 1);
  도트수.set(String(도트[i] ?? "못 잼"), (도트수.get(String(도트[i] ?? "못 잼")) ?? 0) + 1);
  const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const 쓴색 = new Set<string>();
  for (let q = 0; q < data.length; q += info.channels) 쓴색.add(`${data[q]},${data[q + 1]},${data[q + 2]}`);
  색.set(쓴색.size, (색.get(쓴색.size) ?? 0) + 1);
}
console.log(`사진 ${길.length}장`);
console.log(`  크기: ${[...크기].map(([k, v]) => `${k}×${v}장`).join(" · ")}`);
console.log(`  도트: ${[...도트수].map(([k, v]) => `${k}×${v}장`).join(" · ")}`);
const 색값 = [...색.keys()].sort((a, b) => a - b);
console.log(`  색 수: ${색값[0]}~${색값[색값.length - 1]}`);
/* 화면에서 얼마나 키워 쓰나 — 피드 폭 390 기준 */
const 첫크기 = [...크기.keys()][0];
console.log(`  피드(폭 390)에서 ${첫크기} 는 ${(390 / Number(첫크기.split("x")[0])).toFixed(1)}배로 키워 쓴다`);
