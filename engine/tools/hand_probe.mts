/**
 * **손이 잰 것 → 저장 → 로키의 판단** 한 바퀴 (159회차 2026-09-17). 돈: 판단 호출 1번(몇 센트).
 *   GENESIS_SPEND=i-approve npx tsx engine/tools/rookery_env.mts engine/tools/hand_probe.mts
 *
 * ① 손(`hand/rookery-hand.ps1`)을 이 기계에서 돌려 사양을 잰다  ② 저장소에 넣었다 다시 읽는다(모양이 그대로인가)
 * ③ "이 노트북에서 Godot 2D 도트 게임을 만들어 돌린다" 는 일을 주고 **자기 말로** 판단하게 한다.
 * 표는 없다 — 판단이 잰 값을 근거로 말하는지, 관리자 권한을 요구하는 길을 고르지 않는지 사람이 읽는다.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
const { saveSpec, loadSpecs, specLine, judgeMachine, judgmentLines } = await import("../../src/lib/hand/spec");
const { defaultProviders } = await import("../../src/lib/execution/shared");
const { createServiceClient } = await import("../../src/lib/supabase/service");
if (process.env.GENESIS_SPEND !== "i-approve") { console.error("판단 호출에 돈이 든다. GENESIS_SPEND=i-approve 로."); process.exit(1); }
const db = createServiceClient();
const CO = "5925c03a-557f-46d7-8589-7388b769df40";
let bad = 0;
const check = (n: string, ok: boolean, got?: unknown) => { if (!ok) bad++; console.log(ok ? "통과" : "실패", n, ok ? "" : JSON.stringify(got)); };

const t0 = Date.now();
const { stdout } = await run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "hand/rookery-hand.ps1", "-Print"], { timeout: 90_000, maxBuffer: 4 * 1024 * 1024 });
const spec = JSON.parse(stdout.toString());
check(`① 손이 잰다 (${((Date.now() - t0) / 1000).toFixed(0)}초)`, typeof spec.host === "string" && spec.cpu?.cores > 0, spec.host);

const path = await saveSpec(db, CO, spec);
const back = (await loadSpecs(db, CO)).find((s) => s.host === spec.host);
check("② 저장소에 넣었다 읽으면 그대로", !!back && back.ramGB === spec.ramGB && back.engines.unity.length === spec.engines.unity.length, path);
console.log("\n── 잰 값(의견 0):\n" + specLine(spec));

const t1 = Date.now();
const { judgment, model } = await judgeMachine(defaultProviders().ai, {
  spec,
  job: "이 노트북에서 Godot 로 2D 도트 게임(탑다운, 작은 마을, 대화 NPC 셋)을 만들고 여기서 바로 실행해 본다. 만드는 것은 로키가 하고, 엔진은 아직 없다.",
});
console.log(`\n── 판단 (${model}, ${((Date.now() - t1) / 1000).toFixed(0)}초):\n` + judgmentLines(judgment).join("\n"));
check("③ 판단이 필요한 것을 댄다(Godot 이 없으니 최소 하나)", judgment.needs.length >= 1, judgment.needs.length);
// 첫 판: 낱말 "관리자" 로 재니 "관리자 불필요" 를 잡았다(정규식이 뜻을 모른다 — 156회차와 같은 교훈). 진짜 관리자 경로만 본다.
check("   관리자 권한을 요구하는 길(Program Files·승격)을 고르지 않았다", !/Program Files|승격|UAC|runas/i.test(judgment.needs.map((n) => n.where).join(" ")), judgment.needs.map((n) => n.where));
check("   잰 값을 근거로 말한다(램·디스크·GPU 중 하나는 언급)", /램|RAM|디스크|GB|GPU|UHD/i.test(judgment.fits + judgment.settings + judgment.risk));
console.log(bad ? `\n${bad}건 실패` : "\n전부 통과");
