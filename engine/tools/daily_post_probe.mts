/** 매일 게시물 고리 손 시험 (225회차). 사장님 회사에 오늘 몫을 한 번 넣어 본다(값 ≈ $0.02). 두 번째는 자물쇠에 막혀야 한다. */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { runDailyPost } = await import("../../src/lib/genesis/practice");
const { OWNER } = await import("./company.mjs");
const db = createServiceClient();
const log = (m: string) => console.log("  " + m);
console.log("1판:", JSON.stringify(await runDailyPost(db, { companyId: OWNER.companyId, log })));
console.log("2판(자물쇠):", JSON.stringify(await runDailyPost(db, { companyId: OWNER.companyId, log })));
