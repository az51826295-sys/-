/** 배관 시험 — 진짜 모델 한 번 부른다(싼 자리). 그림 없이 대화·친밀도·표정만 본다. */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
import { createServiceClient } from "../../src/lib/supabase/service";
import { runDotTurn } from "../../src/lib/dot/turn";

const USER = "aad3d48c-c92f-492b-bc9e-ce36b7094a12";
const CHAR = "dcb3de9a-d79e-4fb0-b094-9de64214b288";
const db = createServiceClient();

// 앞선 시험 흔적을 지운다 — 친밀도가 쌓여 있으면 첫 대화 보너스를 못 본다.
await db.from("dot_messages").delete().eq("user_id", USER).eq("character_id", CHAR);
await db.from("dot_bonds").delete().eq("user_id", USER).eq("character_id", CHAR);

const says = ["안녕! 나는 오늘 회사에서 진짜 힘든 하루를 보냈어. 고양이 키우는데 걔가 위로해줬어", "너는 뭐 하고 있었어?"];
for (const s of says) {
  const t0 = Date.now();
  const r = await runDotTurn(db, USER, CHAR, s);
  console.log(`\n나 → ${s}`);
  if (r.ok) {
    console.log(`시험 → ${r.reply}`);
    console.log(`   표정 ${r.emotion} · 친밀도 ${r.bond.points}점(+${r.bond.gained}) ${r.bond.stage}단계 · 남은 ${r.remaining}턴 · ${((Date.now()-t0)/1000).toFixed(1)}s`);
    if (r.bond.reasons.length) console.log(`   ${r.bond.reasons.join(" / ")}`);
  } else {
    console.log(`❌ ${JSON.stringify(r)}`);
  }
}
const { data: bond } = await db.from("dot_bonds").select("memo, points, stage").eq("user_id", USER).eq("character_id", CHAR).maybeSingle();
console.log(`\n기억한 것: ${JSON.stringify(bond?.memo)}`);
const { data: u } = await db.from("dot_usage").select("turns, input_tokens, output_tokens").eq("user_id", USER).maybeSingle();
console.log(`오늘 쓴 것: ${u?.turns}턴 · 입력 ${u?.input_tokens} 출력 ${u?.output_tokens} 토큰`);
