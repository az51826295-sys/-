/**
 * **도도에 직접 물어본다** (228회차 10-03, 사장님 "도도 들어가봐"). 모델 0 · 값 0.
 *   npx tsx engine/tools/dodo_check.mts [test|live]
 *
 * 결제가 막히는 자리는 줄줄이인데, 우리가 못 보던 칸이 **도도 쪽**이었다:
 *   로그인 → 계정 → 명단 → 결제창 → **도도에 상품이 있나** → **웹훅이 등록됐나** → 크레딧
 * 앞 셋은 우리 설정이라 봤지만, 뒤 둘은 도도 대시보드 안이라 안 봤다. 열쇠가 있으니 **API 로 묻는다.**
 *
 * **열쇠는 안 찍는다.** 묻기만 하고 답만 보여 준다.
 */
import { readFileSync } from "node:fs";

const 어디 = (process.argv[2] === "live" ? "live" : "test") as "test" | "live";
const 열쇠칸 = `C:/Users/az518/AppData/Local/rookery-dot/dodo${어디 === "live" ? "-live" : ""}.json`;
let 설정: { apiKey?: string; productStarter?: string; productPro?: string; webhookSecret?: string };
try { 설정 = JSON.parse(readFileSync(열쇠칸, "utf8")); } catch { console.error(`열쇠 파일을 못 읽었다: ${열쇠칸}`); process.exit(1); }
if (!설정.apiKey) { console.error("apiKey 가 비어 있다"); process.exit(1); }

const 바탕 = 어디 === "live" ? "https://live.dodopayments.com" : "https://test.dodopayments.com";
console.log(`도도 ${어디} (${바탕})\n`);

async function 묻기(길: string): Promise<{ 코드: number; 몸: any }> {
  const r = await fetch(`${바탕}${길}`, { headers: { authorization: `Bearer ${설정.apiKey}` } });
  let 몸: any = null;
  try { 몸 = await r.json(); } catch { /* 글이 아닐 수도 */ }
  return { 코드: r.status, 몸 };
}

// ── ① 상품이 있나 ─────────────────────────────────────────
const 상품 = await 묻기("/products?page_size=50");
const 목록: any[] = 상품.몸?.items ?? 상품.몸?.data ?? (Array.isArray(상품.몸) ? 상품.몸 : []);
console.log(`① 상품 — ${상품.코드} · ${목록.length}개`);
for (const p of 목록.slice(0, 10)) {
  console.log(`   ${String(p.product_id ?? p.id ?? "?").slice(0, 28).padEnd(30)} ${p.name ?? "(이름 없음)"} · ${p.price?.price ?? p.price ?? "?"} ${p.price?.currency ?? ""} ${p.is_recurring ?? p.recurring ? "(구독)" : ""}`);
}
if (상품.코드 >= 400) console.log(`   ← ${JSON.stringify(상품.몸).slice(0, 200)}`);

// ── ② 우리가 쓰는 상품 id 가 거기 있나 ─────────────────────
const 쓰는것 = [["Starter", 설정.productStarter], ["Pro", 설정.productPro]] as const;
console.log(`\n② 우리가 가리키는 상품`);
for (const [이름, id] of 쓰는것) {
  if (!id) { console.log(`   ${이름.padEnd(8)} **설정에 없음**`); continue; }
  const 하나 = await 묻기(`/products/${encodeURIComponent(id)}`);
  const ok = 하나.코드 === 200;
  console.log(`   ${이름.padEnd(8)} ${ok ? "있음" : `**없음(${하나.코드})**`} · ${id.slice(0, 24)}${ok ? ` · ${하나.몸?.name ?? ""}` : ""}`);
}

// ── ③ 웹훅이 등록됐나 — 여기가 안 되면 돈은 받고 크레딧은 안 준다 ──
for (const 길 of ["/webhooks", "/webhook_endpoints", "/webhooks/endpoints"]) {
  const w = await 묻기(길);
  if (w.코드 === 404) continue;
  const ws: any[] = w.몸?.items ?? w.몸?.data ?? (Array.isArray(w.몸) ? w.몸 : []);
  console.log(`\n③ 웹훅 (${길}) — ${w.코드} · ${ws.length}개`);
  for (const x of ws.slice(0, 5)) console.log(`   ${x.url ?? x.endpoint ?? JSON.stringify(x).slice(0, 80)}`);
  if (!ws.length) console.log(`   **하나도 없다** — 결제가 돼도 크레딧이 안 붙는다.`);
  break;
}

// 우리 웹훅 길은 `/api/billing/dodo` 다(그 아래 route.ts). 처음에 `/webhook` 을 붙여 적었다가
// 도도에 등록된 주소와 대 보고 고쳤다 — **자가 틀린 주소를 들고 있으면 맞는 것도 틀렸다고 한다.**
console.log(`\n우리 서버가 기다리는 웹훅 주소: https://rookery-web-production.up.railway.app/api/billing/dodo`);
