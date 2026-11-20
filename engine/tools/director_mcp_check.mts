/**
 * 판단 엔진 MCP 서버 자 — 손님 도구처럼 stdio 로 붙어 한 바퀴 돈다. 돈 0(판단자 mock).
 *
 *   npx tsx engine/tools/director_mcp_check.mts          모의 판단자
 *   npx tsx engine/tools/director_mcp_check.mts --live   진짜 판단자 한 번(≈$0.02) — 빈 장부 첫 판
 *
 * 재는 것: 표준출력이 JSON 줄뿐인가 · 도구 셋 · 정하기→적기 · 다섯 판 뒤 장부가 답하나(판단자 안 부름) ·
 * 같은 id 두 번 적기·없는 id 는 거절 · 성적표 숫자 · 장부 파일이 손님 폴더에 남나.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const live = process.argv.includes("--live");
const home = mkdtempSync(join(tmpdir(), "director-"));
const p = spawn(process.execPath, ["--import", "tsx", "engine/tools/director_mcp.mts"], {
  env: { ...process.env, DIRECTOR_HOME: home, DIRECTOR_BRAIN: live ? "gpt-5" : "mock" }, stdio: ["pipe", "pipe", "pipe"],
});
let 버퍼 = "", 더러운줄 = 0;
const 기다림 = new Map<number, (v: any) => void>();
p.stdout.on("data", (b) => {
  버퍼 += b.toString();
  let i; while ((i = 버퍼.indexOf("\n")) >= 0) {
    const 줄 = 버퍼.slice(0, i); 버퍼 = 버퍼.slice(i + 1);
    if (!줄.trim()) continue;
    try { const m = JSON.parse(줄); 기다림.get(m.id)?.(m); } catch { 더러운줄++; console.error("표준출력에 JSON 아닌 줄:", 줄.slice(0, 120)); }
  }
});
let 오류글 = ""; p.stderr.on("data", (b) => (오류글 += b.toString()));
let n = 0;
const rpc = (method: string, params?: unknown) => new Promise<any>((res, rej) => {
  const id = ++n; 기다림.set(id, res);
  setTimeout(() => rej(new Error(`${method} 답 없음\n${오류글.slice(-500)}`)), 120_000);
  p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
});
const call = async (name: string, args: unknown) => { const r = (await rpc("tools/call", { name, arguments: args })).result; return { text: r.content[0].text as string, err: !!r.isError }; };
const idOf = (t: string) => /^id (\w+)/.exec(t)?.[1] ?? "";

let 맞음 = 0, 틀림 = 0;
const 봄 = (이름: string, ok: boolean, 보임 = "") => { ok ? 맞음++ : 틀림++; console.log(`${ok ? "✅" : "❌"} ${이름}${보임 ? ` — ${보임}` : ""}`); };

try {
  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "0" } });
  봄("initialize", init.result?.serverInfo?.name === "rookery-director" && init.result.protocolVersion === "2025-06-18");
  p.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  const list = await rpc("tools/list");
  봄("도구 셋", JSON.stringify(list.result.tools.map((t: any) => t.name)) === JSON.stringify(["director_decide", "director_record", "director_scorecard"]));

  // 첫 판 — 빈 장부라 판단자에게 간다(mock 이면 난간으로 첫 자리)
  const d1 = await call("director_decide", { task: "README 오타 찾아 고치기", kind: "찾기" });
  봄("빈 장부 첫 판은 판단자", live ? /정한 길: 판단자/.test(d1.text) : /정한 길: 난간/.test(d1.text), d1.text.split("\n")[1]);
  if (live) console.log(d1.text);
  const 첫자리 = /맡길 AI: (\S+)/.exec(d1.text)?.[1] ?? "";
  let id = idOf(d1.text);
  const r1 = await call("director_record", { id, passed: true, outTokens: 2000, sec: 30 });
  봄("적기 + 토큰으로 값 어림", !r1.err && /\$0\.\d+/.test(r1.text), r1.text);
  const 또 = await call("director_record", { id, passed: false });
  봄("같은 id 두 번은 거절", 또.err);
  const 없음 = await call("director_record", { id: "nope", passed: true });
  봄("없는 id 는 거절", 없음.err);

  // 네 판 더 같은 종류·같은 자리로 통과 → 여섯째는 장부가 답해야 한다
  for (let i = 0; i < 4; i++) {
    const d = await call("director_decide", { task: `오타 ${i}`, kind: "찾기" });
    id = idOf(d.text);
    await call("director_record", { id, passed: true, usd: 0.001, seat: 첫자리 });
  }
  const d6 = await call("director_decide", { task: "오타 또", kind: "찾기" });
  봄("다섯 판 통과 뒤엔 장부가 답함(판단 값 0)", /정한 길: 장부/.test(d6.text) && /판단 값 0/.test(d6.text), d6.text.split("\n")[1]);
  const d7 = await call("director_decide", { task: "새 게임", kind: "게임" });
  봄("다른 종류는 다시 판단자", !/정한 길: 장부/.test(d7.text));

  const sc = await call("director_scorecard", {});
  봄("성적표", /끝난 판 5/.test(sc.text) && /결과 안 적힌 판 2/.test(sc.text) && /장부로 바로 정한 판 0/.test(sc.text) && /아낀 돈/.test(sc.text), sc.text.split("\n").slice(0, 4).join(" | "));

  const 장부 = JSON.parse(readFileSync(join(home, "ledger.json"), "utf8"));
  봄("장부 파일이 손님 폴더에", 장부.length === 7 && 장부.filter((r: any) => r.passed === true).length === 5);
  // 11-21 강화: 떨어지면 한 칸 위로 새 판이 열린다(판단자 안 부름)
  const d7id = idOf(d7.text), 첫게임 = /맡길 AI: (\S+)/.exec(d7.text)?.[1];
  const 떨 = await call("director_record", { id: d7id, passed: false });
  const 새id = /다시 시킬 판 id (\w+)/.exec(떨.text)?.[1];
  봄("떨어지면 한 칸 위로 새 판", !!새id && !/맡길 AI: haiku/.test(떨.text.split("다시 시킬")[1] ?? ""), 떨.text.split("\n").slice(0, 4).join(" | "));
  const 올린 = await call("director_record", { id: 새id, passed: true });
  봄("올린 판도 적힌다", !올린.err && /통과/.test(올린.text), `${첫게임} → ${올린.text}`);
  const sc2 = await call("director_scorecard", {});
  봄("실력 줄 · 올린 판 셈", /실력/.test(sc2.text) && /올린 판 1/.test(sc2.text), sc2.text.split("\n").slice(2, 4).join(" | "));
  const d8 = await call("director_decide", { task: "다른 오타", kind: "검색" });
  봄("처음 보는 종류면 장부의 낱말을 알려 줌", /새 종류 "검색"/.test(d8.text) && /찾기\(/.test(d8.text));
  봄("표준출력이 JSON 줄뿐", 더러운줄 === 0);
} catch (e) {
  틀림++; console.log("❌", (e as Error).message);
} finally {
  p.kill(); rmSync(home, { recursive: true, force: true });
}
console.log(`\n${맞음}/${맞음 + 틀림}`);
process.exit(틀림 ? 1 : 0);
