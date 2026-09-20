// 눈 자 시험 (195회차) — 고장을 심어 잡히는지. 모델 0, 돈 0.
const { buildAlerts, falseAlarmLine } = await import("../../src/lib/genesis/eye");
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };

// 심은 고장: 우리가 쓰는 게 사라짐(sora-2 폐기 재현) · 새 영상 모델 · 단가 없는 새 모델
const report = {
  fresh: [{ id: "veo-4-generate-preview", vendor: "google" }, { id: "gpt-7-nova", vendor: "openai" }, { id: "gpt-5.6-luna", vendor: "openai" }],
  gone: [{ id: "gpt-4-0613" }],
  missingInUse: ["sora-2"],
};
const a = buildAlerts(report, "2026-09-20T12:00:00.000Z");
const kinds = a.map((x) => x.kind);
check("폐기 예고를 급한 알림으로", a.some((x) => x.kind === "gone-in-use" && x.urgent && /sora-2/.test(x.title)), kinds);
check("새 영상 모델을 조건 후보로(급)", a.some((x) => x.kind === "condition-candidate" && x.urgent && /veo-4/.test(x.title)), kinds);
check("영상 모델은 일반 새 모델로 중복 안 냄", !a.some((x) => x.kind === "new-model" && /veo-4/.test(x.title)), kinds);
check("단가 없는 새 모델 → no-price", a.some((x) => x.kind === "no-price" && /gpt-7-nova/.test(x.title)), kinds);
check("단가 있는 모델엔 no-price 안 냄", !a.some((x) => x.kind === "no-price" && /luna/.test(x.title)), kinds);
check("일반 새 모델은 안 급함", a.filter((x) => x.kind === "new-model").every((x) => !x.urgent), kinds);
check("id 가 겹치지 않음", new Set(a.map((x) => x.id)).size === a.length, a.map((x) => x.id));
check("판정 전엔 useful=null", a.every((x) => x.useful === null));
// 오경보율
check("판정 0건이면 '못 센다'", /못 센다/.test(falseAlarmLine(a)), falseAlarmLine(a));
const judged = a.map((x, i) => ({ ...x, useful: i < 2 ? false : true }));
check("오경보율 계산", /오경보 2\/\d+/.test(falseAlarmLine(judged)), falseAlarmLine(judged));
console.log(`\n${bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`}`);
process.exit(bad ? 1 : 0);
