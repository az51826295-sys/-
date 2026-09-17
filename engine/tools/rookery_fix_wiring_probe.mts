/**
 * 수정 요청 → 다시 고치기 잇기 자 (98회차 09-13, 사장님 "남은 거 해"). 모델 없음, 지출 0.
 *   (1) 판이 보내는 말 "수정 요청: <이유>" 가 FIX_WORDS 규칙에 걸린다 — 걸리면 현재 판을 낸 직원이 그 판 위에서 고친다
 *   (2) 판(PreviewPanel)이 needs_changes 성공 뒤에만 onFix 를 부른다 (승인·실패 때는 안 부름)
 *   (3) 대화 화면(AskClient)이 onFix 를 send() 로 잇고 폰 판을 닫는다
 *   npx tsx engine/tools/rookery_fix_wiring_probe.mts
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }
const { FIX_WORDS } = await import("../../src/lib/chat/everydayService");
const lines: [boolean, string][] = [];
const msg = "수정 요청: 표에 2024년 숫자도 넣어 줘";
lines.push([FIX_WORDS.test(msg), `"${msg}" → FIX_WORDS ${FIX_WORDS.test(msg) ? "걸림" : "안 걸림"}`]);
lines.push([!FIX_WORDS.test("경쟁사 3곳 요약해 줘"), `새 일 "경쟁사 3곳 요약해 줘" → 안 걸림`]);
const panel = readFileSync("src/app/ask/PreviewPanel.tsx", "utf8");
const onFixLine = panel.split("\n").find((l) => l.includes("onFix?.(feedback)")) ?? "";
lines.push([/r\.ok && decision === "needs_changes"/.test(onFixLine), `판: onFix 는 성공 + needs_changes 일 때만 — ${onFixLine.trim().slice(0, 70)}`]);
const client = readFileSync("src/app/ask/AskClient.tsx", "utf8");
lines.push([/onFix=\{\(feedback\) => \{ setPreviewOpen\(false\); void send\(`수정 요청: \$\{feedback\}`\)/.test(client), `화면: onFix → 판 닫고 send("수정 요청: …")`]);
for (const [ok, s] of lines) console.log(`  ${ok ? "✅" : "❌"} ${s}`);
console.log(lines.every(([ok]) => ok) ? "모두 통과" : "떨어진 줄 있음");
process.exit(lines.every(([ok]) => ok) ? 0 : 1);
