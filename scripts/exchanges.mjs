// 무엇을 물었고 뭐라 답했는지 — 쌓인 것을 훑어본다. 읽기만 한다.
//
//   node scripts/exchanges.mjs [일수] [--fail] [--id <uuid>]
//
// 기본은 목록이다. 글자를 통째로 쏟지 않는다 — 프롬프트 하나가 몇 만 자라
// 그대로 뿌리면 정작 무엇이 쌓였는지가 안 보인다. 한 줄을 다 보려면 `--id`.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const args = process.argv.slice(2);
const onlyFailed = args.includes("--fail");
const idAt = args.indexOf("--id");
const wantId = idAt >= 0 ? args[idAt + 1] : null;
const days = Number(args.find((a) => /^\d+$/.test(a)) ?? 7);

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
);

if (wantId) {
  const { data, error } = await db
    .from("model_exchanges")
    .select("*")
    .eq("id", wantId)
    .maybeSingle();
  if (error) fail(error);
  else if (!data) console.log("그런 줄이 없습니다.");
  else {
    console.log(`${data.purpose} · ${data.tier} · ${data.model} · ${data.ok ? "성공" : "실패(" + data.error_kind + ")"}`);
    if (data.truncated) console.log("** 이 줄은 잘려 있습니다 **");
    console.log("\n--- 지시 ---\n" + (data.system_instructions ?? ""));
    console.log("\n--- 입력 ---\n" + (data.input ?? ""));
    console.log("\n--- 답 ---\n" + JSON.stringify(data.output, null, 2));
    if (data.error_message) console.log("\n--- 오류 ---\n" + data.error_message);
  }
} else {
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString();
  let q = db
    .from("model_exchanges")
    .select("id, purpose, tier, routing, model, ok, error_kind, input, output, truncated, ms, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(100);
  if (onlyFailed) q = q.eq("ok", false);

  const { data, error } = await q;
  if (error) fail(error);
  else {
    console.log(`최근 ${days}일 · ${data.length}줄${onlyFailed ? " (실패만)" : ""}`);
    for (const r of data) {
      const chars = String(r.input ?? "").length;
      const mark = r.ok ? "  " : "✗ ";
      console.log(
        mark +
          new Date(r.created_at).toLocaleString("ko-KR", { hour12: false }).padEnd(22) +
          String(r.purpose).padEnd(20) +
          String(r.tier ?? "-").padEnd(12) +
          String(r.model ?? "-").padEnd(16) +
          String(chars).padStart(7) + "자" +
          (r.truncated ? " (잘림)" : "") +
          (r.ok ? "" : "  " + r.error_kind),
      );
    }
    const failed = data.filter((r) => !r.ok).length;
    if (failed) console.log(`\n실패 ${failed}줄. 원문은 --id <uuid> 로 봅니다.`);
    // 쌓인 양은 학습을 말할 때 제일 먼저 묻게 되는 숫자다. 여기서 같이 센다.
    const chars = data.reduce((s, r) => s + String(r.input ?? "").length, 0);
    console.log(`글자 ${chars.toLocaleString("ko-KR")}자`);
  }
}

function fail(error) {
  if (/model_exchanges/.test(error.message)) {
    console.error(
      "model_exchanges 표가 아직 없습니다.\n" +
        "  supabase/schema_model_exchanges.sql 을 적용한 뒤 다시 보십시오.",
    );
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
}
