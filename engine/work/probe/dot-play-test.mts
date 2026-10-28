/**
 * **앱 안 결제(Play Billing) 자** (10-28). 모델 0 · 값 0.
 *   npx tsx engine/work/probe/dot-play-test.mts
 *   PLAY_SABOTAGE=1..4 npx tsx engine/work/probe/dot-play-test.mts
 *
 * Digital Goods API 는 브라우저(TWA) 안에만 있으므로 **가짜를 끼워서** 잰다.
 * 그래서 못 재는 것이 분명하다: 진짜 Play 결제창이 어떤 모양으로 뜨는지, 진짜 구매
 * 토큰이 구글 확인을 통과하는지. **그건 실제 앱에서 시험 구매 한 건이 필요하다.**
 *
 * 여기서 재는 것은 **순서**다 — 서버가 확인하기 전에 "샀다" 로 닫지 않는가,
 * 사람이 창을 닫은 것을 고장으로 적지 않는가, 못 받은 구매를 다시 내미는가.
 */
const 심기 = process.env.PLAY_SABOTAGE ?? "";

let 나쁨 = 0;
const 재기 = (n: string, ok: boolean, 본?: unknown) => {
  if (!ok) 나쁨++;
  console.log((ok ? "통과" : "실패") + " " + n + (본 === undefined ? "" : "  " + JSON.stringify(본)));
};

/**
 * 한 묶음을 돌리되 **터져도 자가 멈추지 않게** 한다.
 *
 * 10-28 에 이걸 안 해서 사보타주 두 개가 "0개 잡힘" 으로 보였다. 심은 구현이 던진
 * 예외에 자가 통째로 죽었고, 내 세는 법(`grep -c 실패`)은 **죽은 것과 못 잡은 것을
 * 같은 0 으로 읽었다.** 0 은 "못 본다" 일 수 있다 — 터진 것은 터졌다고 세야 한다.
 */
async function 구역(이름: string, f: () => Promise<void>) {
  try { await f(); } catch (e) {
    재기(`${이름} — 자가 터졌다(이것도 잡은 것이다)`, false, String(e).slice(0, 100));
  }
}

/* ── 가짜 브라우저. 앱 껍데기가 주는 것만 흉내 낸다 ── */
type 기록 = { 닫음: string[]; 서버에낸토큰: string[] };
const 기록: 기록 = { 닫음: [], 서버에낸토큰: [] };

function 브라우저깔기(o: {
  서비스있나?: boolean; 상품있나?: boolean; show?: () => Promise<void>;
  토큰?: string | null; 산것?: { itemId: string; purchaseToken: string }[];
}) {
  const g = globalThis as Record<string, unknown>;
  기록.닫음 = []; 기록.서버에낸토큰 = [];
  if (o.서비스있나 === false) { delete g.window; delete g.PaymentRequest; return; }
  g.PaymentRequest = class {
    constructor(_m: unknown, _d: unknown) {}
    async show() {
      if (o.show) await o.show();
      return {
        details: { purchaseToken: o.토큰 === null ? undefined : (o.토큰 ?? "tok_abc") },
        complete: async (s: string) => { 기록.닫음.push(s); },
      };
    }
  };
  g.window = {
    getDigitalGoodsService: async () => ({
      getDetails: async (ids: string[]) =>
        o.상품있나 === false ? [] : [{ itemId: ids[0], title: "멘헤라 모드", price: { currency: "KRW", value: "4900" } }],
      listPurchases: async () => o.산것 ?? [],
    }),
    location: { href: "" },
  };
}

const 진짜 = await import("../../../src/lib/dot/playClient");
type 모듈 = typeof 진짜;

/* ── 심은 고장. **그럴듯하게 틀린 구현**을 넣는다 — 한 줄씩 흔드는 게 아니라
   "나라면 이렇게 짰을 수도 있다" 는 쪽으로 틀려야 자가 쓸모 있다. ── */
const 가져오기 = async (): Promise<모듈> => {
  if (심기 === "1") return { ...진짜, 앱에서사기: 먼저닫기 };
  if (심기 === "2") return { ...진짜, 앱에서사기: 닫은것도실패 };
  if (심기 === "3") return { ...진짜, 앱에서사기: 서버안묻기 };
  if (심기 === "4") return { ...진짜, 못받은것찾기: async () => 0 };
  return 진짜;
};

/** 1 — 서버에 묻기 전에 success 로 닫는다(제일 흔한 실수). */
const 먼저닫기: 모듈["앱에서사기"] = async (itemId, 서버확인) => {
  const svc = await 진짜.playService();
  if (!svc) return { ok: false, 까닭: "앱아님" };
  const d = (await svc.getDetails([itemId]))[0];
  if (!d) return { ok: false, 까닭: "상품없음" };
  const res = await new PaymentRequest([{ supportedMethods: 진짜.PLAY_METHOD, data: { sku: itemId } }],
    { total: { label: d.title, amount: d.price } }).show();
  await res.complete("success");
  const t = (res.details as { purchaseToken?: string }).purchaseToken ?? "";
  return (await 서버확인(t)) ? { ok: true, purchaseToken: t } : { ok: false, 까닭: "실패" };
};

/** 2 — 사람이 닫은 것을 고장으로 적는다. */
const 닫은것도실패: 모듈["앱에서사기"] = async (itemId, 서버확인) => {
  const r = await 진짜.앱에서사기(itemId, 서버확인);
  return r.ok || r.까닭 !== "취소" ? r : { ok: false, 까닭: "실패", 글: "취소" };
};

/** 3 — PaymentRequest 성공을 그대로 믿는다(서버에 안 묻는다). */
const 서버안묻기: 모듈["앱에서사기"] = async (itemId, _서버확인) => {
  const svc = await 진짜.playService();
  if (!svc) return { ok: false, 까닭: "앱아님" };
  const d = (await svc.getDetails([itemId]))[0];
  if (!d) return { ok: false, 까닭: "상품없음" };
  const res = await new PaymentRequest([{ supportedMethods: 진짜.PLAY_METHOD, data: { sku: itemId } }],
    { total: { label: d.title, amount: d.price } }).show();
  const t = (res.details as { purchaseToken?: string }).purchaseToken ?? "";
  await res.complete("success");
  return { ok: true, purchaseToken: t };
};

/** 서버가 토큰을 받아 주는 척. 심은 고장에 따라 순서를 흔든다. */
const 서버 = (답: boolean) => async (t: string) => { 기록.서버에낸토큰.push(t); return 답; };

/* ── ① 앱이 아니면 앱결제를 하지 않는다 ── */
await 구역("①", async () => {
  브라우저깔기({ 서비스있나: false });
  const { 앱에서사기, playService } = await 가져오기();
  재기("브라우저면 Play 서비스가 없다", (await playService()) === null);
  const r = await 앱에서사기("menhera_sub", 서버(true));
  재기("앱이 아니면 앱아님을 돌려준다", !r.ok && r.까닭 === "앱아님", r);
});

/* ── ② 상품이 Console 에 없으면 결제창을 안 띄운다 ── */
await 구역("②", async () => {
  브라우저깔기({ 상품있나: false });
  const { 앱에서사기 } = await 가져오기();
  const r = await 앱에서사기("menhera_sub", 서버(true));
  재기("상품이 없으면 상품없음", !r.ok && r.까닭 === "상품없음", r);
  재기("상품이 없으면 서버를 안 부른다", 기록.서버에낸토큰.length === 0);
});

/* ── ③ 사람이 창을 닫은 것은 **고장이 아니다** ── */
await 구역("③", async () => {
  브라우저깔기({ show: async () => { const e = new Error("x"); e.name = "AbortError"; throw e; } });
  const { 앱에서사기 } = await 가져오기();
  let r = await 앱에서사기("menhera_sub", 서버(true));
  재기("닫으면 취소다(실패 아님)", !r.ok && r.까닭 === "취소", r);
  브라우저깔기({ show: async () => { throw new Error("진짜 고장") } });
  const m2 = await 가져오기();
  r = await m2.앱에서사기("menhera_sub", 서버(true));
  재기("진짜 고장은 실패로 적는다", !r.ok && r.까닭 === "실패", r);
});

/* ── ④ **순서**: 서버가 확인하기 전에 "샀다" 로 닫지 않는다 ── */
await 구역("④", async () => {
  브라우저깔기({});
  const { 앱에서사기 } = await 가져오기();
  let 확인할때닫혀있었나: string[] = [];
  const r = await 앱에서사기("menhera_sub", async (t) => {
    확인할때닫혀있었나 = [...기록.닫음];      // 서버가 불릴 때 아직 안 닫혔어야 한다
    기록.서버에낸토큰.push(t);
    return true;
  });
  재기("샀으면 ok 다", r.ok, r);
  재기("서버에 구매 토큰을 낸다", 기록.서버에낸토큰[0] === "tok_abc", 기록.서버에낸토큰);
  재기("**서버 확인 전에는 안 닫는다**", 확인할때닫혀있었나.length === 0, 확인할때닫혀있었나);
  재기("확인되면 success 로 닫는다", 기록.닫음.join() === "success", 기록.닫음);
});

/* ── ⑤ 서버가 거절하면 success 로 닫지 않는다 ── */
await 구역("⑤", async () => {
  브라우저깔기({});
  const { 앱에서사기 } = await 가져오기();
  const r = await 앱에서사기("menhera_sub", 서버(false));
  재기("서버가 거절하면 ok 가 아니다", !r.ok, r);
  재기("거절이면 fail 로 닫는다", 기록.닫음.join() === "fail", 기록.닫음);
});

/* ── ⑥ 토큰이 안 오면 샀다고 하지 않는다 ── */
await 구역("⑥", async () => {
  브라우저깔기({ 토큰: null });
  const { 앱에서사기 } = await 가져오기();
  const r = await 앱에서사기("menhera_sub", 서버(true));
  재기("토큰이 없으면 실패", !r.ok && r.까닭 === "실패", r);
  재기("토큰이 없으면 서버를 안 부른다", 기록.서버에낸토큰.length === 0);
});

/* ── ⑦ 못 받은 구매를 다시 내민다 (결제 직후 앱이 죽은 경우) ── */
await 구역("⑦", async () => {
  브라우저깔기({ 산것: [
    { itemId: "menhera_sub", purchaseToken: "t1" },
    { itemId: "menhera_sub", purchaseToken: "t2" },
  ] });
  const { 못받은것찾기 } = await 가져오기();
  const n = await 못받은것찾기(서버(true));
  재기("못 받은 구매를 전부 다시 낸다", n === 2 && 기록.서버에낸토큰.join() === "t1,t2", 기록.서버에낸토큰);
  브라우저깔기({ 서비스있나: false });
  const m = await 가져오기();
  재기("앱이 아니면 훑지 않는다", (await m.못받은것찾기(서버(true))) === 0);
});

console.log(나쁨 === 0 ? "\n전부 통과" : `\n${나쁨}개 실패`);
process.exit(나쁨 === 0 ? 0 : 1);
