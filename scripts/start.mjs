// 한 저장소, 두 역할. Railway 서비스마다 ROOKERY_ROLE 만 다르다.
//   (없음)  → 웹(next start)
//   worker  → 실행 워커(engine/tools/worker.mts): queued 를 돌리고 죽은 running 을 잇는다.
import { spawn } from "node:child_process";
const role = process.env.ROOKERY_ROLE ?? "web";
const port = process.env.PORT ?? "3000";
const cmd = role === "worker"
  ? ["npx", ["tsx", "engine/tools/worker.mts"]]
  : ["npx", ["next", "start", "-p", port]];
console.log(`[start] role=${role} → ${cmd[0]} ${cmd[1].join(" ")}`);
const child = spawn(cmd[0], cmd[1], { stdio: "inherit", shell: process.platform === "win32" });
child.on("exit", (code) => process.exit(code ?? 0));
