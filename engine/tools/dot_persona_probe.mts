/**
 * 66회차 자 — 캐릭터가 **사람 같은가.** 세 캐릭터에게 같은 여섯 마디를 걸고 잰다:
 *   (1) 표정이 골고루 나오나(neutral 비율·종류 수)  (2) 상투구 비율  (3) 자기 설정에서 한 가지를 꺼냈나(설정 낱말 적중률)
 * 시험 계정(smoke-test@dugeun.local)으로, 두근도트 프로젝트에서. 한 판 ≈ 18턴 ≈ $0.01.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
process.env.AI_PROVIDER = "deepseek";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { runDotTurn } = await import("../../src/lib/dot/turn");
const { roots } = await import("../../src/lib/dot/memo");
const db = createServiceClient();
const { data: list } = await db.auth.admin.listUsers();
const uid = list?.users.find((u) => u.email === "smoke-test@dugeun.local")?.id;
if (!uid) throw new Error("시험 계정 없음");
const { data: chars } = await db.from("dot_characters").select("id, slug, name, persona").eq("is_public", true);
const SAYS = ["오늘 진짜 힘들었어", "뭐 하고 있었어?", "너는 뭐 좋아해?", "나 내일 발표 있는데 떨려", "심심해", "밥 뭐 먹지"];
const BLAND = [/편하게 말씀/, /무엇을 도와/, /말해 주세요/, /말해줄 수 있/, /어떤 점이/, /이야기해 주/, /그렇군요/, /다행입니다/, /괜찮으시면/, /무엇이든/];
let allNeutral = 0, allN = 0, allBland = 0, allSpecific = 0;
for (const c of (chars ?? []) as { id: string; slug: string; name: string; persona: string }[]) {
  // 대화·기억을 비우고 시작 — 앞 판이 뒷 판에 새지 않게.
  await db.from("dot_messages").delete().eq("user_id", uid).eq("character_id", c.id);
  await db.from("dot_bonds").delete().eq("user_id", uid).eq("character_id", c.id);
  await db.from("dot_usage").delete().eq("user_id", uid);
  const personaRoots = roots(c.persona);
  const emo: Record<string, number> = {}; let bland = 0, specific = 0; const samples: string[] = [];
  for (const s of SAYS) {
    const r = await runDotTurn(db, uid, c.id, s);
    if (!r.ok) { console.log(`  ❌ ${c.name}: ${JSON.stringify(r)}`); continue; }
    emo[r.emotion] = (emo[r.emotion] ?? 0) + 1;
    if (BLAND.some((b) => b.test(r.reply))) bland++;
    // 답의 낱말 뿌리 중 설정에만 있는 것(흔한 조사·동사 제외)이 하나라도 있나 = 자기 얘기를 꺼냈나
    const hit = [...roots(r.reply)].filter((x) => personaRoots.has(x) && !/^(있|없|하|되|것|사람|오늘|정말|조금|이야|그냥|같이|어떤|뭐|나|너)$/.test(x));
    if (hit.length >= 2) specific++;
    samples.push(`${s} → ${r.reply} [${r.emotion}]`);
  }
  const n = SAYS.length, neutral = emo.neutral ?? 0;
  allN += n; allNeutral += neutral; allBland += bland; allSpecific += specific;
  console.log(`\n${c.name}: 무표정 ${neutral}/${n} · 종류 ${Object.keys(emo).length} · 상투구 ${bland}/${n} · 자기 얘기 ${specific}/${n}`);
  for (const x of samples.slice(0, 3)) console.log("   " + x);
}
console.log("\n── 판정 ──");
const nr = allNeutral / allN, br = allBland / allN, sr = allSpecific / allN;
console.log(`${nr <= 0.4 ? "✅" : "❌"} 무표정 ${(nr*100).toFixed(0)}% (≤40%)`);
console.log(`${br <= 0.1 ? "✅" : "❌"} 상투구 ${(br*100).toFixed(0)}% (≤10%)`);
console.log(`${sr >= 0.5 ? "✅" : "❌"} 자기 얘기 꺼냄 ${(sr*100).toFixed(0)}% (≥50%)`);
