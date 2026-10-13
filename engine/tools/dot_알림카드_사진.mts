/**
 * **알림 카드가 어떻게 보이나** (10-13). 모델 0 · 값 0.
 *   npx tsx engine/tools/dot_알림카드_사진.mts
 *
 * 두근도트 대화창은 로그인해야 보여서 자가 못 띄운다. 그래서 **갈라서 잰다**:
 *   · 언제 뜨는가 — `dot_알림물음_시험.mts` (제품 코드를 그대로 부른다)
 *   · 어떻게 보이는가 — 여기. 카드 markup·CSS 만 떼어 폰 너비로 찍는다.
 *
 * **이건 반쪽이다.** 베껴 온 CSS 가 제품과 어긋나면 이 사진이 거짓말이 된다 —
 * 그래서 베낀 자리를 자가 **맞대어 본다**(아래 ①). 안 맞으면 사진을 안 찍는다.
 */
import { readFileSync } from "node:fs";
import { openHeadless } from "../../src/lib/video/headless";

const 미리 = "engine/work/probe/ask-card.html";
const 제품 = "src/app/dot/[slug]/DotChat.tsx";

/* ① **베낀 CSS 가 제품과 같은가.** 다르면 찍지 않는다 — 안 맞는 사진은 없느니만 못하다. */
const 줄만 = (s: string) => s.replace(/\s+/g, " ").trim();
const 떼기 = (s: string) => {
  const i = s.indexOf(".kk-ask {");
  const j = s.indexOf(".kk-ask-later");
  if (i < 0 || j < 0) return null;
  return 줄만(s.slice(i, s.indexOf("}", j) + 1));
};
const a = 떼기(readFileSync(제품, "utf8"));
const b = 떼기(readFileSync(미리, "utf8"));
if (!a || !b) { console.error("CSS 를 못 찾았다 — 자가 눈이 없다"); process.exit(1); }
if (a !== b) {
  console.error("실패 **미리보기 CSS 가 제품과 다르다** — 사진을 안 찍는다.");
  console.error(`  제품:   ${a.slice(0, 120)}`);
  console.error(`  미리보기: ${b.slice(0, 120)}`);
  process.exit(1);
}
console.log("통과 미리보기 CSS 가 제품과 같다");

/* ② 폰 너비로 찍는다 */
const 창 = await openHeadless({ width: 390, height: 844 });
if (!창) process.exit(1);
try {
  const page = await 창.browser.newPage();
  await page.setViewport({ width: 390, height: 520, deviceScaleFactor: 2 });
  await page.goto(`file://${process.cwd().replace(/\\/g, "/")}/${미리}`, { waitUntil: "networkidle2", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 400));
  /* **가로로 넘치지 않는가** — 폰에서 옆으로 밀리면 단추를 못 누른다 */
  const 넘침 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  console.log(넘침 ? "실패 가로로 넘친다(폰에서 밀린다)" : "통과 폰 너비에 들어간다");
  await page.screenshot({ path: "engine/docs/ui-ask/두근-알림카드.png" as `${string}.png` });
  console.log("찍음: engine/docs/ui-ask/두근-알림카드.png");
  process.exit(넘침 ? 1 : 0);
} finally { await 창.browser.close(); await 창.close?.(); }
