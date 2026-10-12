/**
 * **비싼 것(영상·3D·그림)이 한도에 막히나** (10-12). 모델 0 · 값 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/rookery_비싼것_막나.mts
 *
 * 10-12 오후에 글(텍스트) 호출은 막게 만들었는데, **정작 비싼 것들이 다른 길로 샜다.**
 * 그날 아침 실측: 사장님 지갑 $28.71 중 영상 $10.20 + 3D $3.60 = **48%** 가 그 길이었다.
 * 글 호출은 건당 $0.01~0.03 이라 한도를 채우지도 못한다 — 막아야 할 것은 비싼 쪽이었다.
 *
 * 이 자는 **두 가지를 갈라 본다**:
 *   ① 사기 전에 지갑을 보는 코드가 **있나**(글자 세기 — 자가 할 수 있는 만큼)
 *   ② 막힌 지갑에서 `살수있나()` 가 **정말 안 된다고 하나**(진짜 DB 를 보고 한 번 돌려 본다)
 * ①만 하면 "이름은 있는데 안 불리는" 판을 못 잡는다. ②만 하면 어디가 비었는지 모른다.
 */
import { readFileSync } from "node:fs";

let 나쁨 = 0;
const 재기 = (n: string, ok: boolean, 본?: unknown) => { if (!ok) 나쁨++; console.log(ok ? "통과" : "실패", n, ok ? "" : JSON.stringify(본)); };

/* ── ① 비싼 자리마다 문이 걸려 있나 ── */
const 자리 = [
  { 이름: "영상(Veo/Sora)", 길: "src/lib/skills/videoMake/index.ts", 산다: "makeVeoClip" },
  { 이름: "3D(Meshy)", 길: "src/lib/skills/meshAssets/index.ts", 산다: "meshy" },
  { 이름: "그림(gpt-image-2)", 길: "src/lib/skills/gameAssets/index.ts", 산다: "drawer.draw" },
];
console.log("── 비싼 자리에 문이 걸렸나(글자 세기)\n");
for (const z of 자리) {
  const s = readFileSync(z.길, "utf8");
  const 산다 = s.includes(z.산다);
  const 문 = s.includes("살수있나");
  재기(`${z.이름} — 사기 전에 지갑을 본다`, 산다 && 문, { 사는코드: 산다, 문: 문 });
}

/* ── ② 막힌 지갑에서 정말 안 된다고 하나 ── */
console.log("\n── 막힌 지갑에서 실제로 물어본다\n");
const { 살수있나 } = await import("../../src/lib/costs/beforeBuy");
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();

const { data: 회사들 } = await db.from("companies").select("id,name,spend_limit_usd");
let 막힌회사: { id: string; name: string } | null = null;
let 열린회사: { id: string; name: string } | null = null;
for (const c of (회사들 ?? []) as { id: string; name: string; spend_limit_usd: number | null }[]) {
  if (!c.spend_limit_usd) continue;
  const r = await 살수있나(db, c.id);
  console.log(`   ${String(c.name).padEnd(12)} → ${r.ok ? "살 수 있다" : `**안 산다** (${r.why})`}`);
  if (!r.ok && !막힌회사) 막힌회사 = c;
  if (r.ok && !열린회사) 열린회사 = c;
}

재기("한도에 닿은 지갑은 '안 산다' 고 한다", !!막힌회사, { 막힌회사: 막힌회사?.name ?? null });
재기("열린 지갑은 '살 수 있다' 고 한다", !!열린회사, { 열린회사: 열린회사?.name ?? null });

/* **모름은 막는 쪽으로 기운다** — 장부를 못 읽을 때 "모르니까 사자" 로 두면
   가장 비싼 것들이 통째로 나간다. 없는 회사 id 로 물어 본다. */
const 없는것 = await 살수있나(db, "00000000-0000-0000-0000-000000000000");
재기("모르는 지갑이면 안 산다(모름은 막는 쪽)", !없는것.ok, 없는것);

console.log(나쁨 === 0 ? "\n전부 통과" : `\n실패 ${나쁨}건`);
process.exit(나쁨 === 0 ? 0 : 1);
