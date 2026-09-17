/** 기억 문 — 운영에서 실제로 본 사례로 시험한다. 모델·DB 없음. */
import { support, sameFact, mergeMemo } from "../../src/lib/dot/memo";
let fail = 0;
const ok = (name: string, cond: boolean, got?: unknown) => { console.log(`${cond ? "✅" : "❌"} ${name}${cond ? "" : "  ← " + JSON.stringify(got)}`); if (!cond) fail++; };

// 운영 사례 1: 사장님은 RPG 라는 말을 한 적이 없다. 서하가 물어 놓고 스스로 적었다.
ok("지어낸 기억은 버린다 (RPG)", mergeMemo([], "사용자가 RPG 장르를 좋아함", "아니 내가 만드는건 게임이 아니라 게임을 만드는 ai야").accepted === false);
// 운영 사례 2: 조사가 붙어도 같은 낱말이다.
ok("조사가 달라도 받는다 (고양이를 ← 고양이)", mergeMemo([], "고양이를 키운다", "고양이 키우는데 걔가 위로해줬어").accepted === true);
ok("진짜 말한 것은 받는다", mergeMemo([], "요즘 도트 그래픽 게임을 만들고 있다", "요즘은 도트 그래픽 게임 만들고 있어").accepted === true);
// 운영 사례 3: 같은 얘기 세 번 → 하나로.
const a = mergeMemo(["게임 만드는 AI를 개발하고 시행착오가 많아 힘들어함"], "게임 만드는 AI 개발에 시행착오가 많아 힘들다", "게임 만드는 ai 개발하는데 시행착오가 너무 많아서 힘들어");
ok("같은 얘기는 갈아 끼운다(덧붙이지 않음)", a.memo.length === 1 && a.why === "replaced", a);
ok("다른 얘기는 덧붙인다", mergeMemo(["고양이를 키운다"], "회사에서 힘든 하루를 보냈다", "오늘 회사에서 진짜 힘든 하루였어").memo.length === 2);
ok("빈 것은 아무것도 안 한다", mergeMemo(["x"], "   ", "뭐든").why === "empty");
// 넘치면 오래된 것부터 나간다
// 서로 다른 얘기 14개 — 낱말이 겹치면 같은 얘기로 접히니(그게 맞다) 겹치지 않는 낱말로.
const facts = ["고양이 키움","부산 삶","커피 좋아","축구 봄","기타 침","등산 감","빵 구움","영화 봄","수영 함","그림 그림","피아노 침","여행 감","요리 함","달리기 함"];
let m: string[] = [];
for (const f of facts) m = mergeMemo(m, f, f + " 이야기했어").memo;
ok("12개를 넘으면 오래된 것부터 버린다", m.length === 12 && m[0] === "커피 좋아", m);
// 자 자체
ok("support: 낱말 뿌리 절반 이상", support("고양이를 키운다", "고양이 키우는데") >= 0.5, support("고양이를 키운다", "고양이 키우는데"));
ok("sameFact: 말만 바꾼 같은 얘기", sameFact("RPG 장르를 좋아한다고 함", "사용자가 RPG 장르를 좋아함"));
ok("sameFact: 다른 얘기", !sameFact("고양이를 키운다", "회사에서 힘든 하루를 보냈다"));
console.log(fail ? `\n${fail}개 실패` : "\n모두 통과"); process.exit(fail ? 1 : 0);
