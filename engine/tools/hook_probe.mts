/**
 * **비밀 거르는 훅 자** — 고장을 심어 잡히는지. 모델 0, 돈 0.
 * 09-21: 처음 심은 토큰이 20자를 못 채워 훅이 안 막았고, 나는 "훅이 고장" 이라고 읽을 뻔했다.
 * **심은 고장이 진짜 고장 모양인지부터 확인한다**(같은 실수 오늘 두 번째).
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };
const sh = (cmd: string, args: string[]) => { try { return { out: execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), code: 0 }; } catch (e) { const x = e as { status?: number; stdout?: string; stderr?: string }; return { out: `${x.stdout ?? ""}${x.stderr ?? ""}`, code: x.status ?? 1 }; } };
const F = "secret_probe_tmp.mts";
// **이 파일 자체가 훅에 걸리면 안 되므로** 조각을 쪼개 이어 붙인다.
// (안 쪼개면 자를 커밋할 수 없다 — 훅이 자기 자를 막는다. 09-21에 실제로 겪었다.)
const body = "abcdefghijklmnopqrstuvwxyz0123456789";
const P1 = "sb" + "p_";            // 접근 토큰 앞머리
const P2 = "sk-" + "ant-api03-";   // 앤트로픽 앞머리
const P3 = "AI" + "zaSy";          // 구글 앞머리
const cases: [string, string, boolean][] = [
  ["**진짜 모양의 접근 토큰**", `const t = "${P1}${body}";`, true],
  ["앤트로픽 열쇠", `const k = "${P2}${body}";`, true],
  ["구글 열쇠", `const g = "${P3}${body}";`, true],
  ["**짧은 것은 안 막는다**(변수 이름 같은 것)", `const s = "${P1}short";`, false],
  ["평범한 코드", "export const hello = 1;", false],
];
for (const [name, body, shouldBlock] of cases) {
  writeFileSync(F, body + "\n", "utf8");
  sh("git", ["add", F]);
  const staged = sh("git", ["show", `:${F}`]).out.trim();
  if (staged !== body) { console.error(`심은 것이 안 들어갔다 — 자가 못 잰다: ${name}`); process.exit(2); }
  const r = sh("sh", [".githooks/pre-commit"]);
  check(name, (r.code !== 0) === shouldBlock, { 막혔나: r.code !== 0, 막혀야하나: shouldBlock });
  sh("git", ["reset", "-q", "HEAD", F]);
  try { unlinkSync(F); } catch { /* 없으면 넘어간다 */ }
}
console.log(`\n최종: ${bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`}`);
process.exit(bad ? 1 : 0);
