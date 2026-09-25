/** 개발 계정 한도 보기/바꾸기 (222회차). dev_limit.mts [<달러> <일수>] */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { account } = await import("./company.mjs");
const { checkAllowance } = await import("../../src/lib/costs/allowance");
const db = createServiceClient(); const CO = account().companyId;
if (process.argv[2]) { const { error } = await db.from("companies").update({ spend_limit_usd: Number(process.argv[2]), spend_window_days: Number(process.argv[3] ?? 30) }).eq("id", CO); if (error) throw error; }
const a = await checkAllowance(db, CO);
console.log(`${account().label}: 최근 ${a.windowDays}일 $${a.spentUsd.toFixed(2)} / 한도 $${a.limitUsd} ${a.exhausted ? "— 닫힘" : "— 열림"}`);
