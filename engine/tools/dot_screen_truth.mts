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
/**
 * **HTML 글자를 세면 안 된다** (11-12 01:33 에 걸렸다).
 *
 * 첫 판에서 이 칸을 `fetch` 한 HTML 로 쟀다. 그랬더니 고친 뒤에도 빨갰다 —
 * 이유는 둘 다 **자 쪽**이었다: ① 루트의 **기본** 404 가 RSC 전송 데이터에 슬롯으로
 * 같이 실려서 `This page could not be found` 가 문자열로는 늘 있다(사람은 안 본다),
 * ② 링크가 `\"href\":\"/dot/pick\"` 로 escape 돼 있어 `href="/dot/pick"` 로는 안 걸린다.
 * 둘 다 **대상이 어긋난 것**이다 — 물음은 "사람이 무엇을 보나" 이므로 **렌더된 화면**을 센다
 * ([[measure-the-thing-not-a-proxy]]).
 */
/** Next 기본 404 화면인가 — 검사식을 한 자리에 두고 **아래서 심은 글귀로 시험한다**. */
const 영어기본 = (글: string, 제목: string) =>
  /This page could not be found/.test(글) || /^404/.test(제목);

console.log(`\n# ${집}\n`);
console.log(`## 없는 캐릭터를 열면 (렌더된 화면)`);
const pup = await import("puppeteer-core");
const 브 = await pup.default.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true, userDataDir: `${process.env.TEMP}/rk-tr-${process.pid}`,
  args: ["--no-first-run", "--lang=ko-KR"],
});
const 쪽 = await 브.newPage();
await 쪽.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
for (const 길 of ["/dot/no-such-character-zzz", "/dot/no-such-character-zzz/profile"]) {
  const r = await 쪽.goto(집 + 길, { waitUntil: "networkidle2", timeout: 120_000 });
  await new Promise((x) => setTimeout(x, 2500));
  const 본 = await 쪽.evaluate(() => ({
    글: document.body.innerText.trim(),
    제목: document.title,
    /* 눈에 보이는 링크만 센다 — 화면 밖에 숨은 것은 돌아갈 길이 아니다. */
    길들: [...document.querySelectorAll("a[href]")]
      .filter((a) => (a as HTMLElement).offsetParent !== null)
      .map((a) => a.getAttribute("href") ?? ""),
  }));
  const 기본문 = 영어기본(본.글, 본.제목);
  const 우리글 = /없는 사람|No one here/.test(본.글);
  const 돌아갈길 = 본.길들.some((h) => /^\/dot(\/(pick|search|feed))?$/.test(h));
  맞(!기본문, `${길} → 영어 기본 화면이 아니다${기본문 ? " (지금 그것이다)" : ""}`);
  맞(우리글, `${길} → 우리 글귀가 있다`);
  맞(돌아갈길, `${길} → 눌러서 돌아갈 링크가 있다 (${본.길들.filter((h) => h.startsWith("/dot")).join(", ") || "없음"})`);
  console.log(`         (HTTP ${r?.status()} · 글자 ${본.글.length} · 제목 "${본.제목}")`);
}
/**
 * **이 자에 이빨이 있나** — 대조군 한 자리.
 *
 * "영어 기본 화면이 아니다" 가 맞음으로 나와도, 그 검사가 **무엇이든 통과시키는 것**이면
 * 아무 뜻이 없다([[ruler-audit]]). 처음에는 운영에서 영어 화면이 뜨는 자리를 대조군으로
 * 쓰려 했는데 **그런 자리가 없었다** — 두근도트 프록시가 안 잡힌 주소를 전부 `/dot` 으로
 * 307 보낸다(11-12 01:35 확인: `/zzz-nope-…` → 제목 "두근도트 — 피드"). 영어 기본 화면은
 * `notFound()` 길로만 올 수 있다는 뜻이다.
 *
 * 대조군이 없는데 대조군 자리를 억지로 세우면 **빈 범위로 헛 실패**가 난다
 * ([[unmeasurable-test-is-not-a-failure]]). 그래서 화면 대신 **검사식에 고장을 심는다**:
 * Next 가 실제로 내보내는 두 글귀를 넣어 보고 빨개지는지, 그리고 **우리 화면을 오해하지는
 * 않는지** 양쪽을 센다(이빨만 세면 가짜 경보가 된다).
 */
console.log(`\n## 자에 이빨이 있나 (검사식에 심은 글귀를 넣어 본다)`);
{
  const 심은것: [string, string, string][] = [
    ["404\nThis page could not be found.", "두근도트", "본문에 영어 기본 문구"],
    ["", "404: This page could not be found.", "제목만 영어 기본 404"],
  ];
  for (const [글, 제목, 뭐] of 심은것) 맞(영어기본(글, 제목), `심은 고장을 잡는다 — ${뭐}`);
  맞(!영어기본("···\n없는 사람이에요\n\n주소가 바뀌었거나 없어진 캐릭터예요.\n\n사람 고르기\n피드 보기", "두근도트"),
    `우리 화면을 영어 기본으로 오해하지 않는다`);
}
await 브.close();

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
