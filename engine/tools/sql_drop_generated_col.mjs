/**
 * auth.users INSERT 에서 **생성 칼럼**을 빼낸다 (10-28).
 *
 * `confirmed_at` 은 Supabase 가 `LEAST(email_confirmed_at, phone_confirmed_at)` 로
 * 스스로 채우는 칸이다. 넣으려 하면 428C9 로 **통째로 거부**된다 — 한 칸 때문에 6명이 막혔다.
 *
 * 칼럼 목록에서 자리를 찾고, 값 묶음마다 **그 자리 하나**를 뺀다.
 * 따옴표 안의 쉼표를 세면 안 되므로 직접 훑는다(정규식으로는 못 가른다).
 */
import { readFileSync, writeFileSync } from "node:fs";

const [, , 길, 뺄칼럼 = "confirmed_at"] = process.argv;
const 글 = readFileSync(길, "utf8");

/** 한 줄의 `(...)` 묶음을 top-level 쉼표로 가른다. 홑따옴표 안은 안 센다('' 는 escape). */
function 값가르기(s) {
  const out = [];
  let cur = "", q = false, depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      cur += c;
      if (c === "'") { if (s[i + 1] === "'") { cur += s[++i]; } else q = false; }
      continue;
    }
    if (c === "'") { q = true; cur += c; continue; }
    if (c === "(") { depth++; cur += c; continue; }
    if (c === ")") { depth--; cur += c; continue; }
    if (c === "," && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

const 줄들 = 글.split(/\r?\n/);
let 자리 = -1, 칼럼수 = 0, 고친줄 = 0;

for (let i = 0; i < 줄들.length; i++) {
  const L = 줄들[i];
  const m = L.match(/^insert into auth\.users \((.*)\) values\s*$/);
  if (m) {
    const 칼럼 = 값가르기(m[1]).map((s) => s.trim());
    자리 = 칼럼.findIndex((c) => c.replace(/"/g, "") === 뺄칼럼);
    칼럼수 = 칼럼.length;
    if (자리 < 0) { console.log(`${뺄칼럼} 이 칼럼 목록에 없다 — 손댈 것이 없다`); process.exit(0); }
    칼럼.splice(자리, 1);
    줄들[i] = `insert into auth.users (${칼럼.join(", ")}) values`;
    console.log(`칼럼 ${자리 + 1}번째 "${뺄칼럼}" 을 뺀다 (남은 칼럼 ${칼럼.length}개)`);
    continue;
  }
  if (자리 < 0) continue;
  /* 값 묶음 줄: `(...)` 로 시작해 `,` 나 `;` 로 끝난다. 다음 insert 를 만나면 멈춘다. */
  if (/^insert into /.test(L)) break;
  const t = L.trim();
  if (!t.startsWith("(")) continue;
  const 끝 = t.endsWith(",") || t.endsWith(";") ? t.slice(-1) : "";
  const 속 = t.slice(1, 끝 ? -2 : -1);
  const 값 = 값가르기(속);
  /* **세어 보고 손댄다.** 칸 수가 다르면 내 가르기가 틀린 것이고, 그대로 빼면 값이 한 칸씩 밀린다. */
  if (값.length !== 칼럼수) {
    console.error(`${i + 1}번째 줄: 값이 ${값.length}칸인데 칼럼은 ${칼럼수}칸이다 — 안 건드린다`);
    process.exit(1);
  }
  값.splice(자리, 1);
  줄들[i] = `  (${값.join(",")})${끝}`;
  고친줄++;
}

if (!고친줄) { console.error("**값 줄을 하나도 못 고쳤다** — 모양이 예상과 다르다"); process.exit(1); }
writeFileSync(길, 줄들.join("\n"), "utf8");
console.log(`값 ${고친줄}줄에서 뺐다`);
