/**
 * **그날 돈이 어디로 갔나** (10-12). 모델 0 · 값 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/rookery_하루캐기.mts 2026-10-01
 *
 * 10-01 하루에 333건 $2.64 가 나갔고 그 주에 한도가 찼다.
 * **한도를 풀기 전에 그게 무엇이었는지 알아야 한다** — 모르면 어느 길을 택해도 또 찬다.
 * 짐작하지 않고 장부 칸을 그대로 세어 본다.
 */
import { createClient } from "@supabase/supabase-js";

const 날 = process.argv[2] ?? "2026-10-01";
/** 셋째 인자로 날 수를 주면 그날부터 N일을 한꺼번에 본다 — 한 달 창을 보려고 */
const 날수 = Number(process.argv[3] ?? 1);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

/* **쪽으로 나눠 받는다.** `.limit(5000)` 을 적었는데도 정확히 1000줄이 왔다 —
   Supabase 서버가 한 번에 주는 줄 수에 상한이 있기 때문이다.
   그걸 모르고 세면 "회사 셋이 $17 썼다" 같은 **잘린 숫자**를 사실로 적게 된다.
   (09-27 교훈: 받은 줄 수가 정확히 1000·500 처럼 둥글면 상한을 의심한다.) */
/* 10-12 **날짜를 UTC 로 걸어 놓고 한국 날짜를 넣고 있었다.**
   한국 아침 08시는 UTC 로 전날 23시다 — 그래서 방금 찍힌 2건을 "호출 없음" 이라고 읽었고,
   하마터면 "장부 연결이 안 된다" 고 보고할 뻔했다. **적는 쪽은 UTC, 읽는 사람은 한국**이다.
   주는 날짜를 한국 날짜로 보고 아홉 시간을 뺀다. */
const 한국0시 = (d: string) => new Date(new Date(`${d}T00:00:00Z`).getTime() - 9 * 3600e3);
const 시작 = 한국0시(날).toISOString();
const 끝 = new Date(한국0시(날).getTime() + 날수 * 864e5).toISOString();
const 들: any[] = [];
for (let 쪽 = 0; ; 쪽++) {
  const { data, error } = await db.from("model_usage").select("*")
    .gte("created_at", 시작).lt("created_at", 끝)
    .order("created_at", { ascending: true }).range(쪽 * 1000, 쪽 * 1000 + 999);
  if (error) { console.error("못 읽음:", error.message); process.exit(1); }
  들.push(...(data ?? []));
  if (!data || data.length < 1000) break;
  if (쪽 > 50) { console.error("너무 많다 — 50쪽에서 멈춘다(수를 못 믿는다)"); process.exit(1); }
}
if (!들.length) { console.log(`${날} — 호출 없음`); process.exit(0); }

/** `--회사=<id>` 를 붙이면 그 지갑만 본다 — 사장님 지갑과 개발 지갑은 섞어 보면 안 된다 */
const 회사만 = process.argv.find((a) => a.startsWith("--회사="))?.slice("--회사=".length);
if (회사만) { const 앞 = 들.length; 들.splice(0, 들.length, ...들.filter((r) => r.company_id === 회사만));
  console.log(`  (회사 ${회사만.slice(0, 8)} 만: ${앞} → ${들.length}건)`); }
const 합 = (xs: any[]) => xs.reduce((a, r) => a + Number(r.cost_usd ?? 0), 0);
console.log(`${날}(한국) 부터 ${날수}일 — 호출 ${들.length}건 · $${합(들).toFixed(2)}\n`);
console.log(`  장부 칸: ${Object.keys(들[0]).join(" · ")}\n`);

/** 어떤 칸으로든 갈라서 센다 — 칸 이름을 짐작하지 않고 **있는 칸만** 돌린다 */
const 갈라세기 = (칸: string, 꼭대기 = 12) => {
  if (!(칸 in 들[0])) return;
  const m = new Map<string, { 건: number; 값: number }>();
  for (const r of 들) {
    const k = String(r[칸] ?? "(빔)");
    const v = m.get(k) ?? { 건: 0, 값: 0 };
    v.건++; v.값 += Number(r.cost_usd ?? 0); m.set(k, v);
  }
  console.log(`  ── ${칸} 별`);
  for (const [k, v] of [...m].sort((a, b) => b[1].값 - a[1].값).slice(0, 꼭대기))
    console.log(`     ${k.slice(0, 44).padEnd(46)} ${String(v.건).padStart(4)}건  $${v.값.toFixed(2)}`);
  if (m.size > 꼭대기) console.log(`     …그 밖 ${m.size - 꼭대기}가지`);
  console.log("");
};

for (const 칸 of ["company_id", "model", "seat", "purpose", "kind", "source", "employee_slug", "assignment_id"]) 갈라세기(칸);

/* 시간대 — 사람이 시킨 일이면 깨어 있는 시간에 몰리고, 고리가 돈 것이면 고르게 퍼진다 */
const 시간 = new Map<string, { 건: number; 값: number }>();
for (const r of 들) {
  // 10-12: UTC+9 를 그냥 더해 "31시" 가 나왔다. 24 로 나눈 나머지를 쓴다
  const h = `${String((new Date(r.created_at).getUTCHours() + 9) % 24).padStart(2, "0")}시(한국)`;
  const v = 시간.get(h) ?? { 건: 0, 값: 0 };
  v.건++; v.값 += Number(r.cost_usd ?? 0); 시간.set(h, v);
}
console.log("  ── 시간대별(한국)");
for (const [h, v] of [...시간].sort()) console.log(`     ${h}  ${String(v.건).padStart(4)}건  $${v.값.toFixed(2)}`);

/* 가장 비싼 한 건이 무엇이었나 — 평균만 보면 큰 것이 묻힌다 */
const 비싼 = [...들].sort((a, b) => Number(b.cost_usd ?? 0) - Number(a.cost_usd ?? 0)).slice(0, 5);
console.log("\n  ── 가장 비싼 다섯 건");
for (const r of 비싼)
  console.log(`     $${Number(r.cost_usd ?? 0).toFixed(3)}  ${String(r.model ?? r.seat ?? "?").slice(0, 28).padEnd(30)}`
    + ` ${String(r.created_at).slice(11, 16)}  ${String(r.purpose ?? r.kind ?? r.source ?? "").slice(0, 30)}`);
