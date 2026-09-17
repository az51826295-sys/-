/** 자 자체를 먼저 시험한다. 자가 틀리면 그 자로 잰 판정도 전부 틀린다. */
import { politeSentence, politeness } from "../../src/lib/dot/politeness";
let fail = 0;
const t = (s: string, want: boolean | null) => {
  const got = politeSentence(s);
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? "✅" : "❌"} ${JSON.stringify(s).padEnd(30)} → ${got} (기대 ${want})`);
};
console.log("── 존댓말 ──");
t("밥은 먹었어요?", true);
t("오늘 하루 어땠어요", true);
t("그렇습니다.", true);
t("잘 자요!", true);
t("고생 많으셨네요...", true);
t("좋아하시는 게 뭐예요?", true);
console.log("── 반말 ──");
t("밥은 먹었어?", false);
t("어, 왔네", false);
t("딱히 너 때문은 아니야.", false);
t("그거 재밌겠다!", false);
t("나도 그래ㅋㅋ", false);
t("같이 가자", false);
console.log("── 섞인 글 ──");
const mix = politeness("안녕하세요. 오늘 어땠어요? 그랬구나. 힘들었겠다.");
console.log(`   존댓 ${mix.polite} 반말 ${mix.casual} 못가림 ${mix.unknown} 비율 ${mix.ratio}`);
if (!(mix.polite === 2 && mix.casual === 2)) { fail++; console.log("❌ 섞인 글을 반반으로 못 갈랐다"); }
const none = politeness("...");
if (none.ratio !== null) { fail++; console.log("❌ 못 잰 것을 숫자로 냈다"); }
else console.log("✅ 가릴 문장이 없으면 ratio=null (못 잰 것을 0으로 안 적는다)");
console.log(fail ? `\n${fail}개 실패` : "\n모두 통과");
process.exit(fail ? 1 : 0);
