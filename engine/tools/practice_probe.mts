/** 연습 고리 손 시험 (224회차): 개발 계정에서 주문 1개 → 접수 → 업무(서버의 개발 워커가 집는다) · 정리 한 줄. 값 ≈ $0.05. */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { runPractice, runPracticeSummary } = await import("../../src/lib/genesis/practice");
const { account, OWNER } = await import("./company.mjs");
const db = createServiceClient(); const CO = account().companyId;
const log = (m: string) => console.log("  " + m);
const r = await runPractice(db, { companyId: CO, n: Number(process.argv[2] ?? 1), log });
console.log("연습:", JSON.stringify(r));
const s = await runPracticeSummary(db, { companyId: CO, ownerEmail: OWNER.ownerEmail, log });
console.log("정리:", JSON.stringify(s));
