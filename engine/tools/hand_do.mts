/**
 * **손 v2 실전 — 화면을 보고 대신한다** (162회차 2026-09-17). 돈: 걸음마다 약 $0.01(gpt-5, 그림).
 *   GENESIS_SPEND=i-approve npx tsx engine/tools/rookery_env.mts engine/tools/hand_do.mts "메모장을 열어서 '안녕 로키' 라고 친다"
 *
 * 회사 열쇠는 DB 에서 읽어 환경변수로만 넘긴다(화면에 안 찍는다). PowerShell 은 -STA 로 띄운다 — 한글은 클립보드로 치기 때문.
 * 이 노트북의 마우스·키보드를 실제로 움직인다. 사장님이 마우스를 잡으면 손이 놓는다.
 */
import { spawn } from "node:child_process";
const goal = process.argv[2];
if (!goal) { console.error("목표를 적어라: hand_do.mts \"<목표>\""); process.exit(2); }
if (process.env.GENESIS_SPEND !== "i-approve") { console.error("돈이 든다. GENESIS_SPEND=i-approve 로."); process.exit(1); }
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { data } = await createServiceClient().from("companies").select("unity_key").eq("id", "5925c03a-557f-46d7-8589-7388b769df40").maybeSingle();
const key = (data as { unity_key: string | null } | null)?.unity_key;
if (!key) { console.error("회사 열쇠가 없다"); process.exit(1); }
const t0 = Date.now();
const p = spawn("powershell", ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", "hand/rookery-hand.ps1", "-Do", goal, "-MaxSteps", "25"], { env: { ...process.env, ROOKERY_KEY: key }, stdio: ["ignore", "pipe", "pipe"] });
p.stdout.on("data", (d) => process.stdout.write(d.toString().split(key).join("<열쇠>")));
p.stderr.on("data", (d) => process.stdout.write(d.toString().split(key).join("<열쇠>")));
const code = await new Promise<number | null>((r) => p.on("close", (c) => r(c)));
console.log(`\nexit ${code} · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
