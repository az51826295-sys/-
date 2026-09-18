/** 물음은 일이 아니다 (174회차). 돈 0. */
const { isPureQuestion } = await import("../../src/lib/chat/everydayService");
const cases: [string, boolean][] = [
  ["유니티가 잰다는게 뭔뜻이야?", true], ["다 만들었어?", true], ["아이패드라서 그런가? 안돼", true], ["내가 무슨 기종인지 알 수 있어? 폰 성능", true],
  ["오늘 몇 시야?", true], ["실시간으로 폰을 원격조종할 수 있어?", true],
  ["터치로 하는 간단한 게임 하나 만들어 줘", false], ["공이 너무 빨라. 속도를 절반으로 줄여 줘.", false], ["아니 오른쪽 눌렀는 데 왼쪽으로 가고 왼", false],
  ["폰 게임도 만들 수 있어?", false], ["이거 고칠 수 있어?", false], ["다시 해 줄래?", false], ["시작", false],
];
let bad = 0;
for (const [s, want] of cases) { const got = isPureQuestion(s); if (got !== want) bad++; console.log(got === want ? "맞음  " : "어긋남", JSON.stringify(s), "→", got ? "물음" : "일"); }
console.log(`\n본 줄 ${cases.length} · 어긋남 ${bad}`); process.exit(bad ? 1 : 0);
