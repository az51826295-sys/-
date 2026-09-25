/** 로키 현황판(자기 화면) 자 시험(221회차). 모델 0 · 헤드리스 1번 · DB 1번(재료 읽기). */
const { isBoardAsk, gatherBoardFacts, renderBoard, judgeBoard } = await import("../../src/lib/skills/slidesMake/board");
const { runWeb } = await import("../../src/lib/skills/appBuild/run");
const { account } = await import("./company.mjs");
const { createServiceClient } = await import("../../src/lib/supabase/service");
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };
check("말: '내 화면 만들어 줘'", isBoardAsk("내 화면 만들어 줘"));
check("말: '현황판 그려 줘'", isBoardAsk("로키 현황판 그려 줘"));
check("말: '지출 보이는 화면'", isBoardAsk("지출 보이는 화면 짜 줘"));
check("말: 발표 자료는 아님", !isBoardAsk("로키 소개 발표 자료 8장"));
// 재료는 진짜 DB 에서 — 모델 0
const db = createServiceClient();
const ctx = { supabase: db, execution: { company_id: account().companyId } } as never;   // 222회차: 개발 계정
const f = await gatherBoardFacts(ctx);
check("재료: 지출 숫자·직원 1명 이상·최근 일 1개 이상", typeof f.spendMonthUsd === "number" && f.employees.length >= 1 && f.recent.length >= 1, { spend: f.spendMonthUsd, emp: f.employees.length, recent: f.recent.length });
check("재료: 한도가 읽힌다(양수/양수)", (f.limitUsd ?? 0) > 0 && (f.limitDays ?? 0) > 0, { usd: f.limitUsd, days: f.limitDays });
const good = { title: "로키 현황판", footer: "지금 DB 로", sections: [
  { heading: "이달 지출", lines: [`$${f.spendMonthUsd} / 한도 $${f.limitUsd}`], tone: "plain" as const },
  { heading: "직원", lines: [`${f.employees.length}명`], tone: "good" as const },
  { heading: "수집", lines: [`${f.collected.n}판`], tone: "plain" as const } ] };
const html = renderBoard(good, f);
check("HTML 에 바깥 자원 없음", !/https?:\/\//.test(html));
const r = await runWeb([{ path: "index.html", language: "html", contents: html }], { mobile: false, actions: [{ do: "wait", ms: 400 }] });
const facts = { ran: r.ran, consoleErrors: r.consoleErrors, text: r.text };
const c1 = judgeBoard(good, f, html, facts);
check("좋은 판: 자 4개 전부 맞음", c1.length === 4 && c1.every((k) => k.result === "Passed"), c1.filter((k) => k.result !== "Passed"));
// 고장 심기: 칸 2개 · 지어낸 달러 $999.99
const bad1 = { ...good, sections: [{ heading: "돈", lines: ["$999.99 남음"], tone: "good" as const }, { heading: "직원", lines: ["많음"], tone: "plain" as const }] };
const c2 = judgeBoard(bad1, f, renderBoard(bad1, f), facts).filter((k) => k.result === "Failed").map((k) => k.name);
check("심은 고장: 칸 수·지어낸 달러를 잡는다", c2.includes("칸_3개이상") && c2.includes("지어낸_달러_없음"), c2);
// 숫자 안 보임: 렌더가 바닥줄에 지출을 넣으니 화면에서 지출을 지운 HTML 로
const hidden = html.split(`$${f.spendMonthUsd}`).join("$—");   // 지출은 칸과 바닥줄 두 곳에 있다 — 전부 지워야 "빠짐"
check("숫자 빠지면 잡는다", judgeBoard(good, f, hidden, facts).some((k) => k.name === "숫자_다_보임" && k.result === "Failed"));
check("헤드리스 못 열면 통과 아님", judgeBoard(good, f, html, null).some((k) => k.name === "브라우저_오류0" && k.result === "Failed"));
console.log(`\n${bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`}`);
process.exit(bad ? 1 : 0);
