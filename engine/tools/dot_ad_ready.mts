/**
 * # 광고 **심사가 볼 것**을 우리가 갖췄나 (11-10)
 *
 *   npx tsx engine/tools/dot_ad_ready.mts                     ← 배포된 곳을 두드린다
 *   npx tsx engine/tools/dot_ad_ready.mts http://127.0.0.1:3010
 *
 * `dot_ad_open.mts` 는 **스위치**를 센다(번호·변수). 이 자는 다른 것을 센다 — **구글 심사가
 * 실제로 와서 보는 것**이다. 11-10 에 번호만 기다리고 있었는데, 세 보니 번호가 와도 심사에서
 * 걸릴 자리가 있었다:
 *
 *   · `/robots.txt` 가 **없었다**(404) — 광고 크롤러(`Mediapartners-Google`)를 적어 둔 곳이 없다
 *   · 처리방침에 **광고·쿠키 문단이 없었다** — AdSense 정책이 요구한다. 게다가 거기엔
 *     "광고 목적으로 제3자에게 넘기지 않습니다" 가 적혀 있어 광고를 켜면 **거짓이 된다**
 *   · 소유 확인 길이 `ads.txt` 하나뿐이었다 — 막히면 왜 막혔는지 모른다(메타 태그를 더했다)
 *
 * ## 404 가 둘을 뜻한다 — 그래서 **본문까지 읽는다**
 *
 * `/ads.txt` 는 번호가 없으면 일부러 404 다. 그런데 **길이 아예 없을 때도** 404 다. 둘을 못
 * 가르면 "아직 번호가 없다" 로 읽고 **배포가 안 된 것을 영영 모른다**([[zero-can-mean-i-cannot-see]]).
 * 그래서 본문이 우리가 쓴 글(`ads.txt not configured`)인지 **길이와 글로** 가른다.
 *
 * ## 양쪽을 센다
 *
 * 메타 태그는 **번호가 있을 때만** 있어야 한다. 있어야 할 때 있는지뿐 아니라 **없어야 할 때
 * 없는지**도 센다 — 한쪽만 재면 "항상 그린다" 는 고장을 통과시킨다([[palette-overlap-is-not-style]]).
 */
const 집 = (process.argv[2] ?? "https://dot-web-production-7e03.up.railway.app").replace(/\/$/, "");
const 결과: { 맞음: boolean; 말: string }[] = [];
const 재기 = (맞음: boolean, 말: string) => { 결과.push({ 맞음, 말 }); console.log(`  ${맞음 ? "맞음" : "틀림"}  ${말}`); };

const 봇 = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const 두드리기 = async (길: string, ua = 봇) => {
  const r = await fetch(`${집}${길}`, { headers: { "user-agent": ua }, redirect: "manual", cache: "no-store" as any });
  return { status: r.status, 글: await r.text(), r };
};

console.log(`# ${집}\n`);

/* ── 1. 크롤러가 들어올 수 있나 ───────────────────────────────────────── */
console.log("## 크롤러가 들어올 수 있나");
{
  const { status, 글 } = await 두드리기("/robots.txt");
  재기(status === 200, `/robots.txt 가 있다 (${status})`);
  재기(/Mediapartners-Google/i.test(글), "광고 크롤러(Mediapartners-Google)를 적어 뒀다");
  /* 대조군: 전체를 막는 줄이 끼어들면 위 두 줄은 통과해도 광고는 안 뜬다. */
  const 전체막음 = /User-agent:\s*\*[\s\S]*?Disallow:\s*\/\s*$/m.test(글);
  재기(!전체막음, "전체를 막는 줄이 없다");
}

/* ── 2. 심사가 읽을 내용이 로그인 없이 보이나 ─────────────────────────── */
console.log("\n## 로그인 없이 보이나 (심사는 손님으로 온다)");
for (const [길, 최소] of [["/dot", 5_000], ["/dot/feed", 20_000], ["/dot/privacy", 3_000]] as const) {
  const { status, 글 } = await 두드리기(길);
  재기(status === 200 && 글.length >= 최소, `${길} → ${status}, ${글.length.toLocaleString()}자 (${최소.toLocaleString()}자 이상)`);
}

/* ── 3. 처리방침이 광고를 말하나 (정책 요구) ───────────────────────────── */
console.log("\n## 처리방침이 광고를 말하나");
{
  const { 글 } = await 두드리기("/dot/privacy");
  const 광고문단 = /쿠키/.test(글) && /AdSense|Google/.test(글);
  const 모순 = /광고[·,]?\s*판매 목적으로 제3자에게 넘기지 않습니다/.test(글);
  const 번호있음 = await 번호확인();
  if (번호있음) {
    재기(광고문단, "광고·쿠키 문단이 있다");
    재기(!모순, "광고를 켜 놓고 '광고에 안 넘긴다' 고 적혀 있지 않다");
  } else {
    /* 번호가 없으면 **없는 것이 맞다** — 안 뜨는 광고를 뜬다고 적으면 그게 거짓이다. */
    재기(!광고문단, "아직 광고가 없으니 광고 문단도 없다 (번호가 들어오면 같이 켜진다)");
  }
}

/* ── 4. 소유 확인 길이 둘 다 서 있나 ───────────────────────────────────── */
console.log("\n## 소유를 확인해 줄 길");
async function 번호확인(): Promise<boolean> {
  const { status, 글 } = await 두드리기("/ads.txt");
  return status === 200 && /^google\.com, pub-\d{10,22}, DIRECT/.test(글.trim());
}
{
  const { status, 글 } = await 두드리기("/ads.txt");
  const 번호있음 = status === 200;
  if (번호있음) {
    재기(/^google\.com, pub-\d{10,22}, DIRECT, f08c47fec0942fa0$/.test(글.trim()), `/ads.txt → ${글.trim()}`);
  } else {
    /* 404 가 둘을 뜻한다: "번호 없음"(우리 글) vs "길이 없음"(Next 의 404 화면). */
    const 우리글 = status === 404 && 글.trim() === "ads.txt not configured";
    재기(우리글, `/ads.txt 길이 배포돼 있다 — 번호만 없다 (${status}, ${글.trim().slice(0, 40)})`);
  }

  const { 글: 첫화면 } = await 두드리기("/dot");
  const 태그 = /name="google-adsense-account"\s+content="(ca-pub-\d+)"/.exec(첫화면);
  if (번호있음) 재기(!!태그, `소유 확인 메타 태그가 있다 ${태그 ? `(${태그[1]})` : ""}`);
  else 재기(!태그, "번호가 없으니 메타 태그도 없다 (양쪽을 센다)");
}

/* ── 5. 번호가 와도 남는 벽 — 주소 ────────────────────────────────────── */
console.log("\n## 번호가 와도 남는 벽");
{
  const host = new URL(집).hostname;
  const 남의주소 = /\.(up\.railway\.app|railway\.app|vercel\.app|netlify\.app|onrender\.com)$/.test(host);
  재기(!남의주소, 남의주소
    ? `${host} 는 **우리 것이 아니다** — 부모 주소(railway.app)를 Railway 가 가진다. AdSense 는 소유를 확인할 수 없다 → 도메인 하나가 필요하다`
    : `${host} 는 우리 주소다`);
}

const 틀린 = 결과.filter((x) => !x.맞음);
console.log(`\n${결과.length - 틀린.length}/${결과.length} 맞음`);
if (틀린.length) console.log(틀린.map((x) => `  · ${x.말}`).join("\n"));
process.exit(틀린.length ? 1 : 0);
