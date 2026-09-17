import { applyTurn, stageFor, toNextStage, todayKST, FREE_TURNS_PER_DAY, type BondState } from "../../src/lib/dot/bond";

let fail = 0;
const ok = (name: string, cond: boolean, got?: unknown) => {
  console.log(`${cond ? "✅" : "❌"} ${name}${cond ? "" : `  ← ${JSON.stringify(got)}`}`);
  if (!cond) fail++;
};

// 첫날: 첫 대화 +5, 턴 +1, 길게 +1
let b: BondState = { points: 0, stage: 1, streakDays: 0, lastTalkedOn: null };
let g = applyTurn(b, "2026-09-09", "안녕! 오늘 회사에서 진짜 힘든 일이 있었어");
ok("첫 대화 7점 (1+5+1)", g.gained === 7, g);
ok("연속 1일부터 시작", g.next.streakDays === 1, g.next);

// 같은 날 두 번째: 첫대화 보너스 없음
g = applyTurn(g.next, "2026-09-09", "ㅇㅇ");
ok("같은 날 둘째 턴은 1점", g.gained === 1, g);
ok("짧은 말엔 성의 점수 없음", !g.reasons.some((r) => r.includes("길게")), g.reasons);

// 다음 날: 연속 2일
g = applyTurn(g.next, "2026-09-10", "안녕");
ok("이튿날 연속 2일", g.next.streakDays === 2, g.next);
ok("이튿날 8점 (1+5+연속2)", g.gained === 8, g);

// 하루 걸러: 연속 끊김
g = applyTurn(g.next, "2026-09-12", "오랜만!");
ok("하루 빼먹으면 연속 1로", g.next.streakDays === 1, g.next);

// 단계
ok("0점은 1단계", stageFor(0) === 1);
ok("20점은 2단계", stageFor(20) === 2);
ok("119점은 2단계", stageFor(119) === 2);
ok("120점은 3단계", stageFor(120) === 3);
ok("1000점은 5단계", stageFor(1000) === 5);
ok("5단계는 다음이 없다", toNextStage(1000) === null);
ok("19점이면 2단계까지 1점", toNextStage(19)?.need === 1, toNextStage(19));

// 하루치로 2단계에 닿는가 (제품 판단: 첫날 안에 뭔가 바뀌어야 안 나간다)
let day1: BondState = { points: 0, stage: 1, streakDays: 0, lastTalkedOn: null };
for (let i = 0; i < FREE_TURNS_PER_DAY; i++) day1 = applyTurn(day1, "2026-09-09", "오늘 있었던 일을 얘기해 줄게 진짜 길게").next;
ok(`하루 ${FREE_TURNS_PER_DAY}턴이면 2단계 이상 (${day1.points}점 ${day1.stage}단계)`, day1.stage >= 2, day1);

// 한국 시간
ok("UTC 15:00 은 이미 다음 날(KST)", todayKST(new Date("2026-09-09T15:30:00Z")) === "2026-09-10", todayKST(new Date("2026-09-09T15:30:00Z")));
ok("UTC 14:00 은 아직 같은 날", todayKST(new Date("2026-09-09T14:30:00Z")) === "2026-09-09");

console.log(fail === 0 ? "\n모두 통과" : `\n${fail}개 실패`);
process.exit(fail === 0 ? 0 : 1);
