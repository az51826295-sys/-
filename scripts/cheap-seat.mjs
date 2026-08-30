// 싼 자리가 정말 싸게 갔는가. 읽기만 한다 — 돈이 들지 않는다.
//
//   node scripts/cheap-seat.mjs [일수]
//
// "이 호출이 비쌌다"는 원장에 원래 있었다. 여기서 묻는 것은 그것이 아니라
// **"쌌어야 하는데 비쌌다"** 이고, 그 질문은 등급(`tier`)과 이유(`routing`)가
// 원장에 적히기 시작한 뒤에만 답이 나온다. 그 전 줄들은 빈칸으로 남아 있고,
// 여기서도 짐작해서 채우지 않는다.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].trim();
}

const days = Number(process.argv[2] ?? 30);
const since = new Date(Date.now() - days * 86400 * 1000).toISOString();

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
);

const { data, error } = await db
  .from("model_usage")
  .select("model, purpose, tier, routing, cost_usd, created_at")
  .gte("created_at", since);

if (error) {
  // 칸이 아직 없으면 그렇게 말한다. 원장 자체가 없는 것과 이 눈이 아직 안
  // 달린 것은 다른 이야기이고, 여기서 원래 오류만 흘리면 둘이 같아 보인다.
  if (/tier|routing/.test(error.message)) {
    console.error(
      "원장에 tier/routing 칸이 아직 없습니다.\n" +
        "  supabase/schema_usage_routing.sql 을 적용한 뒤 다시 보십시오.",
    );
  } else {
    console.error(error.message);
  }
  // `process.exit` 을 쓰지 않는다. 붙어 있는 연결이 닫히기 전에 프로세스를
  // 끊으면 윈도우에서 libuv 가 어서션으로 죽고, 종료 코드가 127 로 나온다 —
  // 보고서는 제대로 나왔는데 부른 쪽에서는 실패로 보인다.
  process.exitCode = 1;
}

const usd = (n) => "$" + n.toFixed(4);
const CHEAP = new Set(["conversation", "routine", "verification"]);

// 등급이 안 적힌 줄. 이 눈이 생기기 전의 것이라 셀 수는 있어도 판정할 수 없다.
const unlabelled = data.filter((r) => !r.tier);
const labelled = data.filter((r) => r.tier);

console.log(`최근 ${days}일 · 호출 ${data.length}건`);
if (unlabelled.length) {
  console.log(
    `  이 중 ${unlabelled.length}건은 등급이 안 적힌 옛 줄입니다 — 아래 판정에서 뺍니다.`,
  );
}
if (!error && !labelled.length) {
  console.log("\n등급이 적힌 줄이 아직 없습니다. 한 바퀴 돌고 다시 보십시오.");
}

if (!error && labelled.length) {

const byTier = new Map();
for (const r of labelled) {
  const acc = byTier.get(r.tier) ?? { calls: 0, usd: 0 };
  acc.calls += 1;
  acc.usd += Number(r.cost_usd ?? 0);
  byTier.set(r.tier, acc);
}

console.log("\n등급별");
for (const [tier, a] of [...byTier].sort((x, y) => y[1].usd - x[1].usd)) {
  console.log(`  ${tier.padEnd(13)} ${String(a.calls).padStart(5)}건  ${usd(a.usd)}`);
}

// ── 새는 자리 ────────────────────────────────────────────
//
// `up` 만 고장이다. `images` 는 그림을 볼 수 있는 쪽으로 일부러 올린 것이고,
// `no_economy` 는 싼 벤더를 안 붙여 둔 것이라 고칠 데가 다르다. 셋을 한 줄로
// 합치면 "많이 샌다"만 보이고 무엇을 해야 하는지는 안 보인다.
const cheap = labelled.filter((r) => CHEAP.has(r.tier));
const byWhy = new Map();
for (const r of cheap) {
  const key = `${r.routing ?? "(없음)"}|${r.model}`;
  const acc = byWhy.get(key) ?? { calls: 0, usd: 0 };
  acc.calls += 1;
  acc.usd += Number(r.cost_usd ?? 0);
  byWhy.set(key, acc);
}

console.log("\n싼 등급이 실제로 간 자리");
for (const [key, a] of [...byWhy].sort((x, y) => y[1].usd - x[1].usd)) {
  const [why, model] = key.split("|");
  const mark = why === "up" ? " ←  샌다" : "";
  console.log(
    `  ${why.padEnd(11)} ${model.padEnd(22)} ${String(a.calls).padStart(5)}건  ${usd(a.usd)}${mark}`,
  );
}

const leaked = cheap.filter((r) => r.routing === "up");
const leakedUsd = leaked.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
const cheapUsd = cheap.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);

console.log("");
if (leaked.length === 0) {
  console.log("싼 벤더가 실패해서 비싼 자리로 넘어간 호출은 없습니다.");
} else {
  const share = cheapUsd > 0 ? ((leakedUsd / cheapUsd) * 100).toFixed(1) : "0.0";
  console.log(
    `싼 벤더가 실패해서 비싼 자리로 넘어간 것: ${leaked.length}건, ${usd(leakedUsd)} ` +
      `(싼 등급 지출의 ${share}%)`,
  );
  const byPurpose = new Map();
  for (const r of leaked) {
    byPurpose.set(r.purpose, (byPurpose.get(r.purpose) ?? 0) + 1);
  }
  console.log("  어디서:");
  for (const [purpose, n] of [...byPurpose].sort((x, y) => y[1] - x[1]).slice(0, 8)) {
    console.log(`    ${purpose} — ${n}건`);
  }
}

}
