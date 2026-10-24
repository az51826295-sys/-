/**
 * 아직 한국어가 박힌 **전투 글줄**을 전부 모은다 (10-24).
 * `장면(...)` · `적기(...)` 안의 백틱 틀 중 `말(` 을 안 거친 것만.
 */
import { readFileSync, writeFileSync } from "node:fs";

const 경로 = "C:/Users/az518/Desktop/ai-workforce/public/ash/index.html";
const s = readFileSync(경로, "utf8");
const 줄들 = s.split("\n");

const 모음 = [];
줄들.forEach((ln, i) => {
  if (/^\s*(\/\*|\*|\/\/)/.test(ln)) return;                 // 주석
  for (const m of ln.matchAll(/`((?:[^`\\]|\\.)*)`/g)) {
    const t = m[1];
    if (!/[가-힣]/.test(t)) continue;
    /* 이미 말() 을 거친 줄은 건너뛴다 — 단, 같은 줄에 생 틀이 또 있으면 잡힌다 */
    모음.push({ 줄: i + 1, 틀: t });
  }
});
console.log("한국어 박힌 백틱 틀 " + 모음.length + "개");
writeFileSync(process.argv[2], JSON.stringify(모음, null, 1), "utf8");
모음.forEach((x) => console.log(String(x.줄).padStart(5) + "  " + x.틀.slice(0, 150)));
