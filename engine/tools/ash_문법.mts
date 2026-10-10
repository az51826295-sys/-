/**
 * **index.html 안의 자바스크립트가 문법이 맞는가** (10-10). 모델 0 · 값 0. 1초면 끝난다.
 *   npx tsx engine/tools/ash_문법.mts
 *
 * 10-10 에 템플릿 문자열 안의 HTML 주석에 **백틱**을 써서 템플릿이 끊겼다.
 * `ash_살았나` 가 잡아 주긴 했지만 브라우저를 띄워야 해서 느리다 — 문법은 **브라우저 없이**
 * 1초에 본다. 깨진 줄 번호까지 집어 준다(`new Function` 은 위치를 안 알려 줘서 줄을 늘려 가며 찾는다).
 *
 * 메모리 교훈 「그물이 우리 언어를 안 덮었다」와 같은 구멍이다 —
 * 우리 코드의 절반이 .html 안에 있는데 아무 검사도 그걸 안 보고 있었다.
 */
import { readFileSync } from "node:fs";

const 길 = process.argv[2] ?? "public/ash/index.html";
const 글 = readFileSync(길, "utf8");
const 앞 = 글.indexOf("<script>"), 뒤 = 글.lastIndexOf("</script>");
if (앞 < 0 || 뒤 < 0) { console.error(`${길}: <script> 를 못 찾았다`); process.exit(1); }

const 윗줄수 = 글.slice(0, 앞).split("\n").length - 1;   // html 파일 기준 줄 번호로 바꾸려고
const 줄들 = 글.slice(앞 + 8, 뒤).split("\n");

try {
  new Function(줄들.join("\n"));
  console.log(`문법 통과 — ${길} · 스크립트 ${줄들.length}줄`);
} catch (e) {
  const 말 = (e as Error).message;
  // 어디서 깨졌나: 앞에서부터 한 줄씩 늘려 가며 처음 같은 오류가 나는 지점을 찾는다
  let 깨진 = -1;
  for (let n = 1; n <= 줄들.length; n++) {
    try { new Function(줄들.slice(0, n).join("\n") + "\n/*닫기용*/"); }
    catch (e2) { if ((e2 as Error).message === 말) { 깨진 = n; break; } }
  }
  console.error(`\n문법 깨짐 — ${말}`);
  if (깨진 > 0) {
    console.error(`${길}:${윗줄수 + 깨진} 쯤\n`);
    for (let k = Math.max(0, 깨진 - 3); k < Math.min(줄들.length, 깨진 + 1); k++)
      console.error(`${String(윗줄수 + k + 1).padStart(5)} ${줄들[k].slice(0, 160)}`);
  }
  process.exit(1);
}
