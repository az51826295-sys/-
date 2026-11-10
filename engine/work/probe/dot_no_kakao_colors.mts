/**
 * **카톡 색이 남아 있나** (11-10 사장님: *"기본배경을 검정으로 바꿔, 표절 시비 걸리겠다"*).
 *
 * 자리(아래 탭·격자·말풍선 꼬리)는 흔한 모양이지만 **색은 상표에 가깝다.** 하늘색 `#b2c7d9` 와
 * 노랑 `#fee500` 이 그 둘이다. 소스에서 지우는 것으로 끝내지 않고 **배포된 묶음 파일**까지 본다 —
 * 지웠다고 적은 것과 내보내는 것은 다르다([[fix-measured-locally-never-shipped]]).
 *
 *   npx tsx engine/work/probe/dot_no_kakao_colors.mts
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const 금지 = ["fee500", "b2c7d9"];
let 나쁨 = 0;

/* 1) 소스 — 주석(옛일 기록)은 빼고 센다. */
const 긁기 = execFileSync("git", ["grep", "-n", "-E", 금지.join("|"), "--", "src"], { encoding: "utf8" }).trim().split("\n");
const 코드줄 = 긁기.filter((l) => !/\*|\/\//.test(l.split(":").slice(2).join(":")));
console.log(`소스에 남은 칸 ${코드줄.length}개${코드줄.length ? ":" : ""}`);
for (const l of 코드줄.slice(0, 8)) console.log(`  ${l}`);
if (코드줄.length) 나쁨++;

/* 2) 배포된 묶음 */
const 집 = "https://dot-web-production-7e03.up.railway.app";
const html = await (await fetch(`${집}/dot/rin`, { cache: "no-store" as any })).text();
const 길 = [...new Set([...html.matchAll(/\/_next\/static\/[^"']+?\.(?:js|css)/g)].map((m) => m[0]))];
const 본것 = new Map<string, number>();
for (const p of 길) {
  const t = await (await fetch(`${집}${p}`, { cache: "no-store" as any })).text();
  for (const c of 금지) if (t.toLowerCase().includes(c)) 본것.set(c, (본것.get(c) ?? 0) + 1);
}
for (const c of 금지) {
  const n = 본것.get(c) ?? 0;
  if (n) 나쁨++;
  console.log(`${n ? "틀림" : "맞음"}  배포된 묶음에 #${c} — ${n}개 파일`);
}
console.log(`\n묶음 ${길.length}개를 봤다`);
process.exit(나쁨 ? 1 : 0);
