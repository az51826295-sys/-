/** 사장님 폰으로 한 줄 (223회차). 배치·도구가 끝날 때 쓴다. 구독이 없으면 조용히 0.
 *  npx tsx engine/tools/rookery_env.mts engine/tools/notify.mts "제목" "본문" [--daily] 
 *  --daily: 본문 대신 오늘 수집 표(data-collection.md 마지막 줄들)와 지출로 아침 정리를 만든다. */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { pushToUser } = await import("../../src/lib/push/send");
const { OWNER, account } = await import("./company.mjs");
const { checkAllowance } = await import("../../src/lib/costs/allowance");
const { existsSync, readFileSync } = await import("node:fs");
const db = createServiceClient();
let [title, body] = [process.argv[2] ?? "로키", process.argv[3] ?? ""];
if (process.argv.includes("--daily")) {
  const p = "engine/docs/genesis/data-collection.md";
  const rows = existsSync(p) ? readFileSync(p, "utf8").split(String.fromCharCode(10)).filter((l) => l.startsWith("| ") && /\d{4}-\d{2}-\d{2}/.test(l)) : [];
  const today = new Date().toISOString().slice(0, 10);
  const todays = rows.filter((l) => l.includes(today));
  const a = await checkAllowance(db, OWNER.companyId); const d = await checkAllowance(db, account().companyId);
  title = "로키 — 아침 정리";
  body = `오늘 수집 ${todays.length}판 · 사장님 지갑 $${a.spentUsd.toFixed(2)}/${a.limitUsd}${a.exhausted ? "(닫힘)" : ""} · 개발 $${d.spentUsd.toFixed(2)}/${d.limitUsd}`;
}
const { data: us } = await db.auth.admin.listUsers({ perPage: 200 });
const u = us.users.find((x) => x.email === OWNER.ownerEmail);
if (!u) { console.log("사장님 계정 없음"); process.exit(0); }
const r = await pushToUser(db, u.id, { title, body, url: "/ask", tag: process.argv.includes("--daily") ? "daily" : "notify" });
console.log(`${title} — ${body} → 보냄 ${r.sent} · 죽은 주소 ${r.dead}${r.sent === 0 && r.dead === 0 ? " (구독 없음 — /ask 메뉴에서 '알림 켜기')" : ""}`);
