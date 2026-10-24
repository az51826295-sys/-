/**
 * 잿빛 자료에 글자로 박힌 **낱말**을 전부 모은다 (10-24).
 * 눈으로 고르면 반드시 빠진다 — 자료 블록에서 긁어 목록으로 낸다.
 * 긴 문장(설명글)은 따로 센다: 그건 낱말이 아니라 틀이라 손질이 다르다.
 */
import { readFileSync, writeFileSync } from "node:fs";

const 경로 = "C:/Users/az518/Desktop/ai-workforce/public/ash/index.html";
const s = readFileSync(경로, "utf8");

function 끊기(from) {
  let i = from, depth = 0, started = false;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'" || c === "`") { const q = c; i++; while (i < s.length && s[i] !== q) { if (s[i] === "\\") i++; i++; } }
    else if (c === "/" && s[i + 1] === "/") { while (i < s.length && s[i] !== "\n") i++; }
    else if (c === "/" && s[i + 1] === "*") { i += 2; while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++; i++; }
    else if (c === "{" || c === "[") { depth++; started = true; }
    else if (c === "}" || c === "]") { depth--; if (started && depth === 0) return s.slice(from, i + 1); }
    i++;
  }
  return s.slice(from);
}

const 자리 = new Map();
for (const m of s.matchAll(/^(?:const|let|var)[ \t]+([가-힣A-Za-z_][가-힣A-Za-z0-9_]*)[ \t]*=[ \t]*(?=[{[])/gm)) {
  if (!자리.has(m[1])) 자리.set(m[1], m.index + m[0].length);
}

const 블록이름 = ["구간이름", "구간들", "도감", "특성설명", "영혼석표", "레시피", "매대",
                  "재료이름", "재료출처", "물건아이콘", "기술설명"];

/** 말표에 이미 있는 v.* 키 */
const 말표본문 = 끊기(자리.get("말표"));
const 이미 = new Set([...말표본문.matchAll(/"v\.([^"]+)"/g)].map((m) => m[1]));

const 낱말 = new Map();   // 낱말 -> 어느 블록에서 나왔나
const 문장 = new Map();
for (const 이름 of 블록이름) {
  const at = 자리.get(이름);
  if (at === undefined) { console.log("못 찾음: " + 이름); continue; }
  /* 주석을 지우고 — 주석 속 한국어를 낱말로 세면 쓰레기가 섞인다 */
  const 본문 = 끊기(at).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  for (const m of 본문.matchAll(/(["'])((?:[^\\\n])*?)\1/g)) {
    const t = m[2].trim();
    if (!/[가-힣]/.test(t)) continue;
    /* 태그·숫자만 남는 토막은 버린다 */
    const 민 = t.replace(/<[^>]*>/g, "").trim();
    if (!민) continue;
    const 자료 = 민.length <= 14 && !/[.·—]/.test(민) ? 낱말 : 문장;
    if (!자료.has(민)) 자료.set(민, new Set());
    자료.get(민).add(이름);
  }
  /* 틀 문자열(백틱)은 설명글이다 */
  for (const m of 본문.matchAll(/`((?:[^`\\]|\\.)*)`/g)) {
    const t = m[1].trim();
    if (!/[가-힣]/.test(t)) continue;
    if (!문장.has(t)) 문장.set(t, new Set());
    문장.get(t).add(이름);
  }
}

const 남은낱말 = [...낱말.entries()].filter(([w]) => !이미.has(w));
console.log("낱말 " + 낱말.size + "개 중 아직 안 옮긴 것 " + 남은낱말.length + "개");
console.log("설명 틀 " + 문장.size + "개");
writeFileSync(process.argv[2], JSON.stringify({
  낱말: 남은낱말.map(([w, b]) => ({ 말: w, 블록: [...b] })),
  문장: [...문장.entries()].map(([w, b]) => ({ 말: w, 블록: [...b] })),
}, null, 1), "utf8");
console.log("\n--- 낱말 ---");
console.log(남은낱말.map(([w]) => w).join(" / "));
