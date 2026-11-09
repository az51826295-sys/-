/**
 * dot-worker 와 dot-web 의 **Supabase 칸만** 견준다. 값은 찍지 않고 **같은가/다른가**만 말한다.
 * (일꾼이 옛 DB 에 글을 쓰고 있었다 — 앱은 그걸 못 읽는다.)
 */
import { execFileSync } from "node:child_process";
const 변수 = (서비스: string): Record<string, string> =>
  JSON.parse(execFileSync("cmd", ["/c", "railway", "variables", "--service", 서비스, "--json"], { encoding: "utf8", maxBuffer: 1 << 24 }));
const web = 변수("dot-web"), worker = 변수("dot-worker");
const 볼것 = [...new Set([...Object.keys(web), ...Object.keys(worker)])].filter((k) => /SUPABASE|DATABASE_URL/.test(k)).sort();
console.log(`칸${" ".repeat(34)}웹  일꾼  같나`);
for (const k of 볼것) {
  const a = web[k], b = worker[k];
  console.log(`${k.padEnd(36)}${a ? "있음" : "없음"} ${b ? "있음" : "없음"}  ${a && b ? (a === b ? "같다" : "**다르다**") : "-"}`);
}
