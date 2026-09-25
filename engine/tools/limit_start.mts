/** 사장님 회사 한도의 세는 시작점을 지금으로 (223회차). 숫자는 안 바꾼다. ROOKERY_ACCOUNT=owner 아니면 개발 계정. */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { account } = await import("./company.mjs");
const { checkAllowance } = await import("../../src/lib/costs/allowance");
const db = createServiceClient(); const CO = account().companyId;
const { error } = await db.from("companies").update({ credits_started_at: new Date().toISOString() }).eq("id", CO).eq("billing_mode", "limit");
if (error) throw error;
const a = await checkAllowance(db, CO);
console.log(`${account().label}: 시작점 지금 → 최근 ${a.windowDays}일 $${a.spentUsd.toFixed(2)} / 한도 $${a.limitUsd} ${a.exhausted ? "— 닫힘" : "— 열림"}`);
