/**
 * 판단 엔진 MCP 서버를 명령줄에서 한 번 부른다 — 클로드 코드가 붙는 것과 **같은 stdio 길**로.
 * (서버가 아직 안 붙은 세션에서 손으로 쓸 때, 그리고 손님이 MCP 없이 쓸 때.)
 *
 *   npx tsx engine/tools/director_cli.mts decide "<일>" <종류>
 *   npx tsx engine/tools/director_cli.mts record <id> pass|fail [outTokens=N] [usd=N] [sec=N] [met=N total=N] [seat=X]
 *   npx tsx engine/tools/director_cli.mts scorecard [baseline]
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [cmd, ...rest] = process.argv.slice(2);
let name: string, args: Record<string, unknown>;
if (cmd === "decide") { name = "director_decide"; args = { task: rest[0], kind: rest[1] }; }
else if (cmd === "record") {
  name = "director_record"; args = { id: rest[0], passed: rest[1] === "pass" };
  for (const kv of rest.slice(2)) { const [k, v] = kv.split("="); args[k] = k === "seat" ? v : Number(v); }
} else if (cmd === "scorecard") { name = "director_scorecard"; args = rest[0] ? { baseline: rest[0] } : {}; }
else { console.error("decide | record | scorecard"); process.exit(2); }

const 서버 = join(dirname(fileURLToPath(import.meta.url)), "director_mcp.mts");
const p = spawn(process.execPath, ["--import", "tsx", 서버], { stdio: ["pipe", "pipe", "inherit"] });
let 버퍼 = "";
p.stdout.on("data", (b) => {
  버퍼 += b.toString();
  for (const 줄 of 버퍼.split("\n").slice(0, -1)) {
    const m = JSON.parse(줄);
    if (m.id === 2) { console.log(m.result.content[0].text); p.kill(); process.exit(m.result.isError ? 1 : 0); }
  }
  버퍼 = 버퍼.slice(버퍼.lastIndexOf("\n") + 1);
});
const w = (o: unknown) => p.stdin.write(JSON.stringify(o) + "\n");
w({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "director-cli", version: "0" } } });
w({ jsonrpc: "2.0", method: "notifications/initialized" });
w({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } });
