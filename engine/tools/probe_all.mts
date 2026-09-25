/**
 * **모델 0 인 자 시험을 한 번에** (218회차 09-25). 오늘 자가 낸 사고 다섯은 "하나를 고치고 다른 자가 깨졌는지 안 봐서" 났다.
 * 돈 안 드는 시험만 모았다(헤드리스는 든다 — --fast 로 뺄 수 있다). 모델을 부르는 시험(chat_bench·script_judge_probe 등)은 여기 없다.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/probe_all.mts [--fast]
 */
import { spawnSync } from "node:child_process";
const fast = process.argv.includes("--fast");
const PURE = ["predict_probe", "revert_probe", "mech_probe", "schema_repair_probe", "out_probe", "translate_probe", "srt_probe"];
const HEADLESS = ["slides_probe", "measure_order_probe", "webguard_probe", "reap_probe"];
const list = fast ? PURE : [...PURE, ...HEADLESS];
const rows: string[] = []; let bad = 0; const t0 = Date.now();
for (const name of list) {
  const t = Date.now();
  const r = spawnSync("npx", ["tsx", "engine/tools/rookery_env.mts", `engine/tools/${name}.mts`], { encoding: "utf8", shell: true, timeout: 600_000 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.split(String.fromCharCode(10)).filter((l) => !/Assertion|로키 DB/.test(l) && l.trim());
  const last = out.filter((l) => /맞음|어긋남|전부|틀림|\d+\/\d+/.test(l)).pop() ?? out.pop() ?? "(출력 없음)";
  const ok = r.status === 0;
  if (!ok) bad++;
  rows.push(`${ok ? "✅" : "❌"} ${name.padEnd(22)} ${Math.round((Date.now() - t) / 1000)}초  ${last.slice(0, 90)}`);
}
console.log(rows.join(String.fromCharCode(10)));
console.log(`${String.fromCharCode(10)}${list.length - bad}/${list.length} 통과 · ${Math.round((Date.now() - t0) / 1000)}초${fast ? " (--fast: 헤드리스 뺌)" : ""}`);
process.exit(bad ? 1 : 0);
