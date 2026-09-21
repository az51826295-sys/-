/** 2단계 자를 **잠그기 전에** 가짜 기록으로 끝까지 돌린다(09-21 규칙). 모델 0, 돈 0. */
const { judgeStage2, stage2Done, STAGE2 } = await import("../../src/lib/genesis/stage2Verdict");
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };
const t = (bn: number, bo: number, en: number, eo: number) => ({ best: { n: bn, ok: bo }, explore: { n: en, ok: eo } });

check("지금 상태(0/0)는 '못 잼'", judgeStage2(t(0, 0, 0, 0)).kind === "못 잼", judgeStage2(t(0, 0, 0, 0)));
check("모자라면 얼마나 모자란지 말한다", JSON.stringify((judgeStage2(t(2, 1, 0, 0)) as { need: unknown }).need) === '{"best":3,"explore":5}', judgeStage2(t(2, 1, 0, 0)));
check("한쪽만 차도 '못 잼'", judgeStage2(t(5, 4, 3, 1)).kind === "못 잼");
check("**큰 차이면 머리가 낫다**(5/5 vs 2/5 = +60%p)", judgeStage2(t(5, 5, 5, 2)).kind === "머리가 낫다", judgeStage2(t(5, 5, 5, 2)));
check("**반대면 섞는 게 낫다**", judgeStage2(t(5, 1, 5, 4)).kind === "섞는 게 낫다");
check("**1판 차이(20%p)는 모름**", judgeStage2(t(5, 4, 5, 3)).kind === "모름", judgeStage2(t(5, 4, 5, 3)));
check("2판 차이(40%p)는 띠 밖 — 머리가 낫다", judgeStage2(t(5, 4, 5, 2)).kind === "머리가 낫다");
check("똑같으면 모름", judgeStage2(t(5, 3, 5, 3)).kind === "모름");
check("**모름도 '잰 것은 끝'이다** — 여기서 판을 더 쌓지 않는다", stage2Done(judgeStage2(t(5, 3, 5, 3))) === true);
check("못 잼은 안 끝났다", stage2Done(judgeStage2(t(1, 0, 0, 0))) === false);
check("띠가 0.4 로 잠겨 있다", STAGE2.band === 0.4 && STAGE2.minN === 5);
console.log(`\n최종: ${bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`}`);
process.exit(bad ? 1 : 0);
