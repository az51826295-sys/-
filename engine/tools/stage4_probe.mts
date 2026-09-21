/** 4단계 본판 자 — **판을 열기 전에** 가짜 기록으로 끝까지 돌린다(09-21 규칙). 모델 0, 돈 0. */
const { judgeStage4, TARGET_ROUNDS, WHOLE_REWRITE } = await import("../../src/lib/genesis/stage4Verdict");
type FixRound = import("../../src/lib/genesis/stage4Verdict").FixRound;
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };
const r = (o: Partial<FixRound> = {}): FixRound => ({ n: 1, patched: true, changedLines: 5, totalLines: 300, asked: true, broke: false, ...o });
const five = (o: Partial<FixRound> = {}) => Array.from({ length: 5 }, (_, i) => r({ n: i + 1, ...o }));

check("고침이 모자라면 못 잼", judgeStage4(five().slice(0, 3), true).kind === "못 잼", judgeStage4(five().slice(0, 3), true));
check("사장님 말이 없으면 못 잼", judgeStage4(five(), null).kind === "못 잼", judgeStage4(five(), null));
check("**아무도 안 본 판이 있으면 못 잼**(통과로 반올림 안 함)", judgeStage4([...five().slice(0, 4), r({ n: 5, broke: null })], true).kind === "못 잼");
check("**다섯 번을 조각으로 고치고 사장님이 됐다고 하면 통과**", judgeStage4(five(), true).kind === "통과", judgeStage4(five(), true));
check("통째로 다시 쓴 판이 하나라도 있으면 미통과", judgeStage4([...five().slice(0, 4), r({ n: 5, changedLines: 200, totalLines: 300 })], true).kind === "미통과");
check("조각 경로를 안 탔으면 통째로 친다", judgeStage4([...five().slice(0, 4), r({ n: 5, patched: false })], true).kind === "미통과");
check("되던 것이 깨지면 미통과", judgeStage4([...five().slice(0, 4), r({ n: 5, broke: true })], true).kind === "미통과");
check("사장님이 아직 아니라고 하면 미통과", judgeStage4(five(), false).kind === "미통과", judgeStage4(five(), false));
check("절반 **미만**은 조각이다", judgeStage4([...five().slice(0, 4), r({ n: 5, changedLines: 149, totalLines: 300 })], true).kind === "통과");
check("정확히 절반은 통째로 친다", judgeStage4([...five().slice(0, 4), r({ n: 5, changedLines: 150, totalLines: 300 })], true).kind === "미통과");
check("잠근 값이 그대로다", TARGET_ROUNDS === 5 && WHOLE_REWRITE === 0.5);
check("미통과 이유가 여럿이면 다 적는다", (judgeStage4([...five().slice(0, 4), r({ n: 5, patched: false, broke: true })], false) as { why: string }).why.split(" · ").length === 3);
console.log(`\n최종: ${bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`}`);
process.exit(bad ? 1 : 0);
