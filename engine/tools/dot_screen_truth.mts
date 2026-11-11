/**
 * # 화면이 **참말을 하나** — 없는 주소와 버전 (11-12)
 *
 *   npx tsx engine/tools/dot_screen_truth.mts [주소]
 *
 * 11-12 01:2x, 운영 에러 #310 을 쫓다가 **다른 것 둘**이 걸렸다. #310 은 우리 것이 아니었고
 * (Next 의 `AppRouter` 안, 열려 있는 버그 vercel/next.js#97354), 사람에게 보이는 고장은
 * 이 둘이었다:
 *
 *  1. **없는 캐릭터 주소** → 구글 번역기 같은 영어 기본 화면 `404 This page could not be found.`
 *     글자 33자, 돌아갈 링크 0개. `not-found.tsx` 가 **어디에도 없었다**.
 *  2. **설정 화면이 "두근도트 1.0.7"** — Play 에 올라간 앱은 **1.0.10** 이다. 화면이 거짓말을 한다.
 *
 * ## 자를 먼저 만든 이유
 *
 * 고치고 나서 자를 만들면 **고치기 전에 빨갰다는 증거가 없다** — 뭘 바꿨는지 못 잰다
 * ([[unrun-code-is-unmeasured]]). 그래서 이 자는 **고침보다 먼저** 돌려 둘 다 빨간 것을
 * 확인한 뒤에 코드를 손댔다. 심은 고장이 아니라 **실제로 재현된 고장**이 대조군이다
 * ([[ruler-must-catch-a-reproduced-bug]]).
 *
 * ## 못 잼을 실패로 세지 않는다
 *
 * 버전의 진짜 출처는 `dot-android/app/build.gradle` 의 `versionName` 인데, 그건 **다른
 * 폴더**다(두근도트는 제 집으로 이사했다). 그 파일이 없는 기계에서는 **"못 잼"** 으로 적고
 * 분모에서 뺀다 — 빈 범위로 헛 실패를 만들지 않는다([[unmeasurable-test-is-not-a-failure]]).
 */
import { existsSync, readFileSync } from "node:fs";

const 집 = (process.argv[2] ?? "https://dot-web-production-7e03.up.railway.app").replace(/\/$/, "");
const 줄: [boolean | null, string][] = [];
const 맞 = (c: boolean, s: string) => 줄.push([c, s]);
const 못잼 = (s: string) => 줄.push([null, s]);

const 긁 = async (길: string) => {
  try {
    const r = await fetch(집 + 길, { headers: { "user-agent": "Mozilla/5.0 dot_screen_truth" } });
    return { status: r.status, html: await r.text() };
  } catch (e) {
    return { status: 0, html: `(못 열었다: ${(e as Error).message})` };
  }
};

/* ── 1. 없는 주소 ───────────────────────────────────────────── */
console.log(`\n# ${집}\n`);
console.log(`## 없는 캐릭터를 열면`);
for (const 길 of ["/dot/no-such-character-zzz", "/dot/no-such-character-zzz/profile"]) {
  const { status, html } = await 긁(길);
  const 기본문 = html.includes("This page could not be found");
  const 우리글 = /돌아가|찾아보|없어진|없는 사람/.test(html);
  const 돌아갈길 = /href="\/dot(\/(pick|search|feed))?"/.test(html);
  맞(!기본문, `${길} → 영어 기본 화면이 아니다${기본문 ? " (지금 그것이다)" : ""}`);
  맞(우리글, `${길} → 우리 글귀가 있다`);
  맞(돌아갈길, `${길} → 돌아갈 링크가 있다`);
  /* 상태 코드는 Next 가 스트리밍이면 200 을 준다고 **문서에 적혀 있다** — 실패로 세지 않고 적기만 한다. */
  console.log(`         (HTTP ${status} — 스트리밍이면 200 이 정상이다, 문서 기준)`);
}

/* ── 2. 버전이 참인가 ───────────────────────────────────────── */
console.log(`\n## 설정 화면의 버전이 앱과 같나`);
const 그레이들 = "C:/Users/az518/Desktop/dot-android/app/build.gradle";
const { html: 설정 } = await 긁("/dot/settings");
/* React 는 `{t(...)} 1.0.7` 을 **`두근도트<!-- -->1.0.7`** 로 내보낸다. 주석을 지우지 않으면
   자가 제 눈을 가린다 — 11-12 01:29 에 실제로 그렇게 0/8 이 났다([[self-masking-ruler]]). */
const 벗긴 = 설정.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ");
const 화면 = 벗긴.match(/두근도트\s+(\d+\.\d+\.\d+)/)?.[1] ?? null;
맞(!!화면, `설정 화면에서 버전을 찾았다${화면 ? ` (${화면})` : " — 두근도트 x.y.z 꼴이 없다"}`);
/* 두 물음을 섞지 않는다: "읽었나" 와 "같나" 는 따로 센다. */
const 앱 = existsSync(그레이들)
  ? (readFileSync(그레이들, "utf8").match(/versionName\s+"([^"]+)"/)?.[1] ?? null)
  : null;
if (!existsSync(그레이들)) 못잼(`${그레이들} 가 이 기계에 없다 — 버전 대조는 못 잼 (다른 폴더에 있다)`);
else if (!앱) 못잼(`build.gradle 은 있는데 versionName 줄을 못 읽었다`);
else if (!화면) 못잼(`앱은 ${앱} 인데 화면 쪽을 못 읽어 대조 못 잼`);
else 맞(앱 === 화면, `화면 ${화면} = 앱 ${앱}${앱 === 화면 ? "" : "  ← 화면이 거짓말을 한다"}`);
/* 숫자를 손으로 적어 두면 또 어긋난다 — 한 자리에서만 오는지도 센다. */
const 소스 = "src/app/dot/settings/page.tsx";
if (existsSync(소스)) {
  const s = readFileSync(소스, "utf8");
  맞(!/두근도트\}?\s*\d+\.\d+\.\d+|\)\}\s*\d+\.\d+\.\d+/.test(s) && !/"\d+\.\d+\.\d+"/.test(s),
    `${소스} 에 버전 숫자를 손으로 안 적었다 (한 자리에서 온다)`);
}

/* ── 셈 ─────────────────────────────────────────────────────── */
console.log("");
let 맞음 = 0, 센것 = 0;
for (const [c, s] of 줄) {
  console.log(`  ${c === null ? "못 잼" : c ? "맞음" : "틀림"}  ${s}`);
  if (c !== null) { 센것++; if (c) 맞음++; }
}
const 못잰수 = 줄.filter(([c]) => c === null).length;
console.log(`\n${맞음}/${센것} 맞음${못잰수 ? ` · 못 잼 ${못잰수}개 (분모에서 뺐다)` : ""}`);
for (const [c, s] of 줄) if (c === false) console.log(`  · ${s}`);
process.exit(맞음 === 센것 ? 0 : 1);
