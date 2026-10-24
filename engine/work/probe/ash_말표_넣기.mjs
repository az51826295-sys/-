/**
 * `낱말영어` 를 index.html 의 `말표` 끝에 `v.<한국어>` 로 끼워 넣는다 (10-24).
 * 이미 있는 키는 건드리지 않는다. 한 번 더 돌려도 같은 결과가 나와야 한다.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { 낱말영어 } from "./ash_낱말_영어.mjs";

const 경로 = "C:/Users/az518/Desktop/ai-workforce/public/ash/index.html";
let s = readFileSync(경로, "utf8");

/** 말표 선언의 여는 중괄호와 닫는 중괄호 자리를 찾는다 */
const 머리 = s.match(/^const 말표 = \{/m);
if (!머리) throw new Error("말표 선언을 못 찾았다");
const 열림 = 머리.index + 머리[0].length - 1;
let i = 열림, depth = 0;
while (i < s.length) {
  const c = s[i];
  if (c === '"' || c === "'" || c === "`") { const q = c; i++; while (i < s.length && s[i] !== q) { if (s[i] === "\\") i++; i++; } }
  else if (c === "/" && s[i + 1] === "/") { while (i < s.length && s[i] !== "\n") i++; }
  else if (c === "/" && s[i + 1] === "*") { i += 2; while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++; i++; }
  else if (c === "{") depth++;
  else if (c === "}") { depth--; if (depth === 0) break; }
  i++;
}
const 닫힘 = i;
const 본문 = s.slice(열림, 닫힘);

const 이미 = new Set([...본문.matchAll(/"(v\.[^"]+)"/g)].map((m) => m[1]));
const 넣을것 = Object.entries(낱말영어).filter(([ko]) => !이미.has("v." + ko));
if (!넣을것.length) { console.log("넣을 것이 없다 — 이미 다 들어가 있다"); process.exit(0); }

const 줄 = ["", "  /* ── 자료에 글자로 박힌 낱말 (10-24 전세계화 2판) ──",
  "     `말값()` 이 이 표를 보고 옮긴다. 표에 없으면 한국어가 그대로 나온다 — 빈 화면보다 낫다. */"];
for (const [ko, en] of 넣을것) 줄.push("  " + JSON.stringify("v." + ko) + ": { ko: " + JSON.stringify(ko) + ", en: " + JSON.stringify(en) + " },");

s = s.slice(0, 닫힘) + 줄.join("\n") + "\n" + s.slice(닫힘);
writeFileSync(경로, s, "utf8");
console.log("말표에 " + 넣을것.length + "줄 넣었다");
