/**
 * # 하트 결제가 **어디까지 됐나** (11-12)
 *
 *   npx tsx engine/tools/dot_pay_ready.mts [주소]
 *
 * 메모(`dot-play-payment-runbook`)는 *"'결제' 라고 하면 먼저 `dot_pay_ready.mts` 를 돌려라"*
 * 라고 적어 두었는데, 그 파일은 **11-06 에 구독을 없애면서 같이 지워져 있었다**(`99a7664`).
 * 즉 열흘 넘게 **이름만 있는 자**를 가리키고 있었다 — 기억이 가리키는 파일은 쓰기 전에
 * 있는지 본다([[unrun-code-is-unmeasured]]).
 *
 * 다시 세우면서 재는 대상도 바꿨다. 옛 자는 구독(`menhera_sub`)을 쟀다. 지금 파는 것은
 * **하트 묶음**(소모품)이다.
 *
 * ## 404 와 401 을 가른다
 *
 * 제일 중요한 칸은 **길이 있나**다. 11-12 01:4x 에 `/dot/pay` 는 값을 그려 놓고
 * `/api/dot/buy` 로 보내는데 그 길이 **없었다**. 로그인 없이 POST 해서
 *
 *  · **404** 면 길이 없다 (또는 프록시가 삼켰다)
 *  · **401** 이면 길이 있고 그 뒤 검사로 넘어갔다
 *
 * 숫자 하나로 갈린다 — 그래서 본문도 같이 적는다([[db-constraint-errors-must-be-read]] 와
 * 같은 결: 안 읽은 오류가 좀비를 만든다).
 *
 * ## 못 잼을 실패로 세지 않는다
 *
 * **진짜 구매 한 건**은 사장님 손가락이고(라이선스 테스터 결제), Play Console 에 소모품
 * 세 개(`hearts_10/30/60`)가 있는지도 바깥에서 못 본다. 그 둘은 **못 잼**으로 적고 분모에서
 * 뺀다([[unmeasurable-test-is-not-a-failure]]). 대신 **목(mock)으로 되는 곳까지**는 끝까지 센다.
 */
import { existsSync, readFileSync } from "node:fs";

const 집 = (process.argv[2] ?? "https://dot-web-production-7e03.up.railway.app").replace(/\/$/, "");
const 줄: [boolean | null, string][] = [];
const 맞 = (c: boolean, s: string) => 줄.push([c, s]);
const 못잼 = (s: string) => 줄.push([null, s]);

console.log(`\n# 하트 결제 — ${집}\n`);

/* ── 1. 받는 쪽이 있나 ─────────────────────────────────────── */
console.log(`## 받는 쪽 (/api/dot/buy)`);
{
  const r = await fetch(`${집}/api/dot/buy`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ pack: "hearts_10", token: "mock-ok-ruler" }),
    redirect: "manual",
  });
  const 글 = (await r.text().catch(() => "")).slice(0, 160);
  const 있다 = r.status !== 404 && r.status !== 307 && r.status !== 308;
  맞(있다, `길이 있다 — HTTP ${r.status}${있다 ? " (로그인·설정 검사로 넘어갔다)" : " ← 404/307 은 길이 없다는 뜻"}`);
  /* 로그인 없이 왔으니 **401 이 맞다.** 200 이 나오면 아무나 하트를 받아 가는 자리다. */
  맞(r.status !== 200, `로그인 없이 200 을 주지 않는다${r.status === 200 ? " ← 지갑이 열려 있다!" : ""}`);
  console.log(`         본문: ${JSON.stringify(글)}`);
}

/* ── 2. 파는 쪽 화면 ───────────────────────────────────────── */
console.log(`\n## 파는 쪽 (/dot/pay, 렌더된 화면)`);
{
  const pup = await import("puppeteer-core");
  const 브 = await pup.default.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true, userDataDir: `${process.env.TEMP}/rk-pay-${process.pid}`,
    args: ["--no-first-run", "--lang=ko-KR"],
  });
  const 쪽 = await 브.newPage();
  await 쪽.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await 쪽.goto(`${집}/dot/pay`, { waitUntil: "networkidle2", timeout: 120_000 });
  await new Promise((x) => setTimeout(x, 2500));
  const 본 = await 쪽.evaluate(() => ({
    글: document.body.innerText.trim(),
    단추: [...document.querySelectorAll("button")].filter((b) => (b as HTMLElement).offsetParent !== null).length,
  }));
  await 브.close();
  for (const 값 of ["1,200원", "2,900원", "3,900원"]) 맞(본.글.includes(값), `${값} 묶음이 보인다`);
  맞(본.단추 >= 3, `누를 수 있는 단추가 셋 이상 (${본.단추}개)`);
  const 준비중 = /결제 준비 중/.test(본.글);
  console.log(`         ${준비중 ? "지금은 **준비 중** 이라고 적혀 있다 — HEART_BILLING_OPEN 이 아직이다" : "준비 중 글귀가 없다 — 파는 길이 열려 있다"}`);
}

/* ── 3. 목으로 끝까지 (구글 없이) ──────────────────────────── */
console.log(`\n## 목으로 되는 곳까지 (PLAY_VERIFY_MOCK=1)`);
{
  process.env.PLAY_VERIFY_MOCK = "1";
  const { verifyProduct, acknowledgeProduct } = await import("../../src/lib/dot/playVerify");
  const 좋음 = await verifyProduct("pkg", "hearts_10", "mock-ok-1");
  맞(좋음.ok, `산 토큰은 통과한다`);
  const 안삼 = await verifyProduct("pkg", "hearts_10", "mock-no-1");
  맞(!안삼.ok && 안삼.reason === "안삼", `없는 구매는 "안삼" 으로 갈린다 (${안삼.ok ? "통과했다!" : 안삼.reason})`);
  const 아무 = await verifyProduct("pkg", "hearts_10", "그냥아무토큰");
  맞(!아무.ok, `아무 토큰은 거절한다 (${아무.ok ? "통과했다!" : 아무.reason})`);
  const ack = await acknowledgeProduct("pkg", "hearts_10", "mock-ok-1");
  맞(ack.ok, `승인 길이 돈다`);
  delete process.env.PLAY_VERIFY_MOCK;
  /* 목을 껐을 때 **열쇠 없이 통과하지 않는지**도 센다 — 목 스위치가 운영에 새면 지갑이 열린다. */
  const 열쇠없이 = await verifyProduct("pkg", "hearts_10", "mock-ok-1");
  맞(!열쇠없이.ok, `목을 끄면 mock- 토큰도 거절한다 (${열쇠없이.ok ? "통과했다!" : 열쇠없이.reason})`);
}

/* ── 4. 옛 길로 되돌아가지 않았나 ──────────────────────────── */
console.log(`\n## 옛 코드가 되살아나지 않았나`);
{
  const 파일 = "src/app/dot/pay/PayClient.tsx";
  if (existsSync(파일)) {
    const s = readFileSync(파일, "utf8");
    맞(!/location\.href\s*=\s*`?\/api\/dot\/buy/.test(s), `${파일} 이 GET 으로 길에 보내지 않는다`);
    맞(/method:\s*"POST"/.test(s) && /\/api\/dot\/buy/.test(s), `${파일} 이 POST 로 토큰을 내민다`);
  }
  맞(existsSync("src/app/api/dot/buy/route.ts"), `받는 쪽 파일이 있다`);
  맞(existsSync("src/lib/dot/playVerify.ts"), `구글에 묻는 쪽 파일이 있다`);
}

/* ── 5. 상품이 진짜 Play 에 있나 (열쇠가 있을 때만) ────────── */
/**
 * 11-12 에 상품 셋을 콘솔에서 만들었다. "만들었다" 는 **내 기억**이고, 이 칸은 **구글의 답**이다.
 * 열쇠(`PLAY_VERIFY_KEY`)가 있는 데서 돌리면 실제로 물어본다:
 *
 *   railway run --service dot-web -- npx tsx engine/tools/dot_pay_ready.mts
 *
 * 열쇠가 없으면 **못 잼**으로 남긴다 — 0 을 "없다" 로 읽지 않는다([[zero-can-mean-i-cannot-see]]).
 */
console.log(`\n## Play 에 상품이 있나 (구글에 직접 묻는다)`);
{
  const pkg = (process.env.DOT_PACKAGE ?? "").trim();
  const { accessTokenFromEnv } = await import("../../src/lib/dot/playVerify");
  const at = process.env.PLAY_VERIFY_KEY ? await accessTokenFromEnv() : null;
  if (!pkg || !at) {
    못잼(`Play 에 hearts_10/30/60 이 있나 — ${!pkg ? "DOT_PACKAGE" : "PLAY_VERIFY_KEY"} 가 이 셸에 없다 (railway run 으로 돌려야 보인다)`);
  } else {
    /* 새 길(onetimeproducts)이 먼저, 안 되면 옛 길(inappproducts). 둘 다 안 되면 못 잼이다. */
    /* 옛 `inappproducts` 는 **403 "Please migrate to the new publishing API."** 로 닫혔다(11-12 실측).
       지금 길은 **`oneTimeProducts`** 다 — 대소문자까지 그대로여야 한다. 소문자로 쓰면 구글이
       HTML 404 를 준다. 길 이름을 추측하지 않고 **discovery 문서에서 베꼈다**
       (`$discovery/rest?version=v3`). 둘 다 남겨 두는 까닭은, 막힌 길의 **거절 글**이
       "권한이 없다" 와 "길이 옮겨졌다" 를 갈라 주기 때문이다. */
    const 길들 = [
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(pkg)}/oneTimeProducts`,
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(pkg)}/inappproducts`,
    ];
    let 글: string | null = null;
    let 쓴길 = "";
    const 거절: string[] = [];
    for (const u of 길들) {
      const r = await fetch(u, { headers: { authorization: `Bearer ${at}` } });
      if (r.ok) { 글 = await r.text(); 쓴길 = u.split("/").pop() ?? ""; break; }
      /* **거절 글을 읽는다** — 401(권한 없음)과 404(길이 없음)는 다른 이야기다
         ([[db-constraint-errors-must-be-read]]). 안 읽으면 "없다" 로 잘못 적게 된다. */
      거절.push(`${u.split("/").pop()} → HTTP ${r.status} ${(await r.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 120)}`);
    }
    if (글 === null) 못잼(`Play 목록을 못 받았다 — ${거절.join(" · ")}`);
    else {
      console.log(`         ${쓴길} 로 받았다 (${글.length}자)`);
      /**
       * **글자로 세지 않는다.** 한 상품에 174개 지역 값이 붙어 응답이 12만 자다 — 앞에서 몇 천 자만
       * 잘라 `includes` 로 보면 이웃 상품의 값을 보거나 아무것도 못 본다(처음에 그렇게 써서 3줄이
       * 헛되이 빨갰다). JSON 으로 풀어 **그 상품의 한국 칸**을 집는다([[measure-the-thing-not-a-proxy]]).
       *
       * 값의 모양도 추측하지 않고 실물을 봤다: 마이크로가 아니라 `{currencyCode:"KRW", units:"1200"}` 이다.
       */
      const 받은 = JSON.parse(글) as {
        oneTimeProducts?: {
          productId?: string;
          purchaseOptions?: {
            purchaseOptionId?: string; state?: string;
            regionalPricingAndAvailabilityConfigs?: { regionCode?: string; price?: { currencyCode?: string; units?: string }; availability?: string }[];
          }[];
        }[];
      };
      const 목록 = 받은.oneTimeProducts ?? [];
      for (const [sku, 원] of [["hearts_10", "1200"], ["hearts_30", "2900"], ["hearts_60", "3900"]] as const) {
        const p = 목록.find((x) => x.productId === sku);
        맞(!!p, `${sku} 가 Play 에 있다`);
        if (!p) continue;
        const 옵 = (p.purchaseOptions ?? [])[0];
        const kr = (옵?.regionalPricingAndAvailabilityConfigs ?? []).find((c) => c.regionCode === "KR");
        /* **있다 ≠ 팔린다.** 활성이 아니거나 한국이 "사용 불가" 면 단추를 눌러도 상품이 안 뜬다. */
        /**
         * **끈 것과 못 만든 것을 가른다** (11-13).
         *
         * 사장님이 결제를 접기로 하셔서 세 묶음을 **일부러 비활성화**했다. 그런데 자가 그걸
         * 그대로 "틀림" 으로 외치면, 다음에 이 자를 보는 사람은 고장인 줄 알고 되살린다
         * ([[recovered-failures-hide-in-the-ledger]] 의 반대 결 — 멀쩡한 상태가 빨갛게 남는다).
         *
         * 그래서 **파는 스위치를 기준으로 본다**: 열려 있으면 활성이어야 하고(이빨 유지 —
         * 스위치만 켜고 상품이 꺼져 있으면 단추를 눌러도 아무것도 안 뜬다), 닫혀 있으면
         * 상태만 적는다.
         */
        if (process.env.HEART_BILLING_OPEN === "1") {
          맞(옵?.state === "ACTIVE", `${sku} 의 구매 옵션이 활성 (${옵?.purchaseOptionId ?? "없음"} · ${옵?.state ?? "없음"})`);
        } else {
          console.log(`         ${sku} 구매 옵션 ${옵?.state ?? "없음"} — 파는 스위치가 닫혀 있어 세지 않는다(11-13 에 일부러 껐다)`);
        }
        맞(kr?.price?.currencyCode === "KRW" && kr?.price?.units === 원 && kr?.availability === "AVAILABLE",
          `${sku} 가 한국에서 ${Number(원).toLocaleString()}원에 팔린다 (${kr?.price?.units ?? "없음"} ${kr?.availability ?? ""})`);
      }
      /* 이빨 — 없는 묶음을 "있다" 고 하면 위 세 줄은 아무것도 못 지킨다. */
      맞(!목록.some((x) => x.productId === "hearts_99_없는것"), `없는 묶음은 없다고 한다`);
    }
  }
}

/* ── 못 잼 ─────────────────────────────────────────────────── */
못잼(`진짜 구매 한 건 + 승인 — **사장님 손가락**(라이선스 테스터 결제)`);
못잼(`HEART_BILLING_OPEN·PLAY_VERIFY_KEY·DOT_PACKAGE 의 값 — 서버 안에서만 보인다`);

/* ── 셈 ────────────────────────────────────────────────────── */
console.log("");
let 맞음 = 0, 센것 = 0;
for (const [c, s] of 줄) {
  console.log(`  ${c === null ? "못 잼" : c ? "맞음" : "틀림"}  ${s}`);
  if (c !== null) { 센것++; if (c) 맞음++; }
}
const 못잰수 = 줄.filter(([c]) => c === null).length;
console.log(`\n${맞음}/${센것} 맞음 · 못 잼 ${못잰수}개 (분모에서 뺐다)`);
for (const [c, s] of 줄) if (c === false) console.log(`  · ${s}`);
process.exit(맞음 === 센것 ? 0 : 1);
