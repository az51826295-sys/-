/** 모은 낱말을 번역표가 전부 덮었나 — 빠진 것과 쓸데없는 것을 둘 다 찍는다 */
import { readFileSync } from "node:fs";
import { 낱말영어 } from "./ash_낱말_영어.mjs";

const 모음 = JSON.parse(readFileSync(process.argv[2], "utf8"));
const 아이콘 = (w) => /^i-/.test(w);
const 모은것 = 모음.낱말.map((x) => x.말).filter((w) => !아이콘(w));
const 번역 = new Set(Object.keys(낱말영어));

const 빠짐 = 모은것.filter((w) => !번역.has(w));
const 남음 = [...번역].filter((w) => !모은것.includes(w));
console.log("모은 낱말(아이콘 뺀) " + 모은것.length + "개 · 번역표 " + 번역.size + "개");
console.log("\n빠진 것 " + 빠짐.length + "개" + (빠짐.length ? ":\n  " + 빠짐.join(" / ") : ""));
console.log("\n표에만 있는 것 " + 남음.length + "개" + (남음.length ? ":\n  " + 남음.join(" / ") : ""));
/** 영어가 비거나 한국어가 그대로 남은 것 */
const 수상 = Object.entries(낱말영어).filter(([k, v]) => !v || /[가-힣]/.test(v));
console.log("\n영어가 아닌 값 " + 수상.length + "개" + (수상.length ? ": " + 수상.map(([k]) => k).join(" / ") : ""));
