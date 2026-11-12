import { userIdFrom } from "@/lib/dot/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { todayKST } from "@/lib/dot/bond";
import { HEART_PACKS, balanceFor, heartBillingOpen } from "@/lib/dot/money";
import { verifyProduct, acknowledgeProduct } from "@/lib/dot/playVerify";

/**
 * **하트 묶음을 산다 — 받는 쪽** (11-12).
 *
 * 11-12 01:4x 에 보니 `/dot/pay` 는 1,200/2,900/3,900원을 그려 놓고 `/api/dot/buy` 로
 * 보내는데 **그 길이 없었다**(11-06 에 구독을 없애면서 같이 지워졌다). 파는 쪽만 남아
 * 있었던 것이다. 그래서 다시 세운다 — 이번엔 **소모품**으로.
 *
 * ## 화면이 하는 말을 믿지 않는다
 *
 * 받는 것은 `{ pack, token }` 뿐이고, 하트를 더하는 근거는 **구글에 직접 물어본 답**이다.
 * 10-24 에 이 자리는 스위치 하나(`BILLING_OPEN=1`)만 켜면 아무나 POST 해서 크레딧을
 * 받아 가는 자리였다. 열쇠(`PLAY_VERIFY_KEY`)가 없으면 **안 준다** — 503 으로 닫는다.
 *
 * ## 같은 토큰을 두 번 내밀면
 *
 * 번호표를 **`dot_purchases.ref`** 로 쓴다(이 기계에 DDL 열쇠가 없어 UNIQUE 를 못 건다).
 * 그래서 두 걸음으로 적는다:
 *
 *  1. `credits: 0` 으로 **먼저 적어 자리를 찜한다**
 *  2. 지갑을 올린 뒤 그 줄의 `credits` 를 진짜 수로 **고친다**
 *
 * 이러면 중간에 끊겨도 **되살릴 수 있다**: 줄은 있는데 `credits` 가 0 이면 *"돈은 받았고
 * 하트는 아직"* 이라는 뜻이라 다시 부르면 이어서 올린다. 한 걸음으로 적으면 그 상태가
 * **"이미 줬다" 와 구별이 안 돼** 산 사람이 빈손이 된다([[two-writers-need-a-decided-id]]).
 *
 * UNIQUE 가 없으니 **같은 순간에 두 번** 들어오면 줄이 둘 될 수 있다. 지갑은 CAS 로
 * 올리므로 하트가 두 배가 되지는 않지만, 장부에 줄이 둘 남는다 — 알고 남기는 구멍이다.
 * DDL 열쇠가 생기면 `ref` 에 UNIQUE 를 걸고 이 글을 지운다.
 *
 * ## 승인(acknowledge)
 *
 * **마지막이 제일 중요하다.** 사흘 안에 승인하지 않으면 구글이 돈을 돌려주고 조용히
 * 거둬 간다 — 오류도 안 난다. 그래서 승인 실패는 200 안에 `승인: false` 로 **적어서**
 * 돌려준다(하트는 이미 줬으니 사람을 막지 않는다). 자가 그 칸을 본다.
 */
export async function POST(request: Request) {
  const userId = await userIdFrom(request);
  if (!userId) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  if (!heartBillingOpen()) return Response.json({ error: "결제는 곧 열려요. 지금은 출석과 광고로 받아 주세요." }, { status: 503 });

  const pkg = (process.env.DOT_PACKAGE ?? "").trim();
  if (!pkg) return Response.json({ error: "결제 설정이 아직이에요." }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { pack?: string; token?: string };
  const pack = HEART_PACKS.find((p) => p.key === body.pack);
  if (!pack) return Response.json({ error: "그런 묶음이 없어요." }, { status: 400 });
  const token = (body.token ?? "").trim();
  if (!token) return Response.json({ error: "구매 증명이 없어요." }, { status: 400 });

  /* 1) 구글에 묻는다 — 이것이 하트를 주는 **유일한** 근거다. */
  const 확인 = await verifyProduct(pkg, pack.key, token);
  if (!확인.ok) {
    if (확인.reason === "안삼") return Response.json({ error: "구매를 찾을 수 없어요." }, { status: 404 });
    if (확인.reason === "열쇠없음") return Response.json({ error: "결제 확인이 아직 준비 안 됐어요." }, { status: 503 });
    /* 못물어봄 = 구글이 답을 안 줬다. 사람 탓이 아니므로 다시 눌러 볼 수 있게 502 로 돌려준다. */
    if (확인.reason === "못물어봄") return Response.json({ error: "확인이 안 돼요. 잠시 뒤 다시 눌러 주세요.", note: 확인.note }, { status: 502 });
    return Response.json({ error: "이 구매로는 받을 수 없어요.", note: 확인.note }, { status: 409 });
  }
  if (확인.consumed) return Response.json({ error: "이미 받은 구매예요." }, { status: 409 });

  const db = createServiceClient();
  const day = todayKST();

  /* 2) 번호표. 이미 **다 끝난** 줄이면 그대로 돌려준다(두 번 누른 사람에게 오류를 주지 않는다). */
  const { data: 있던 } = await db
    .from("dot_purchases").select("id, credits").eq("ref", token).eq("source", "play").maybeSingle();
  if (있던 && Number(있던.credits) > 0) {
    return Response.json({ ok: true, 이미: true, balance: await balanceFor(db, userId, day) });
  }
  let 줄id = 있던?.id as number | undefined;
  if (!줄id) {
    const { data: 새줄, error: 적기 } = await db
      .from("dot_purchases")
      .insert({ user_id: userId, sku: pack.key, credits: 0, menhera_days: 0, source: "play", ref: token })
      .select("id").single();
    if (적기) return Response.json({ error: 적기.message }, { status: 500 });
    줄id = 새줄.id as number;
  }

  /* 3) 지갑을 올린다 — **읽은 값 그대로일 때만**(CAS). 같은 순간에 두 번 와도 하나만 이긴다. */
  let 올림 = false;
  for (let 판 = 0; 판 < 3 && !올림; 판++) {
    await db.from("dot_wallet").upsert({ user_id: userId, credits: 0 }, { onConflict: "user_id", ignoreDuplicates: true });
    const { data: 지금 } = await db.from("dot_wallet").select("credits").eq("user_id", userId).maybeSingle();
    const 전 = Number(지금?.credits ?? 0);
    const { data: 뒤 } = await db
      .from("dot_wallet").update({ credits: 전 + pack.hearts, updated_at: new Date().toISOString() })
      .eq("user_id", userId).eq("credits", 전).select("credits");
    올림 = (뒤?.length ?? 0) > 0;
  }
  if (!올림) return Response.json({ error: "충전이 밀렸어요. 다시 눌러 주세요." }, { status: 503 });

  /* 4) 번호표를 진짜 수로 고친다 — 여기까지 와야 "줬다" 가 된다. */
  await db.from("dot_purchases").update({ credits: pack.hearts }).eq("id", 줄id);

  /* 5) 승인. 실패해도 사람을 막지 않지만 **반드시 적는다** — 안 하면 사흘 뒤 조용히 돌아간다. */
  const 승인 = 확인.acknowledged ? { ok: true, note: "이미 승인돼 있었다" } : await acknowledgeProduct(pkg, pack.key, token);

  return Response.json({
    ok: true,
    hearts: pack.hearts,
    주문: 확인.orderId,
    승인: 승인.ok,
    승인글: 승인.note ?? null,
    balance: await balanceFor(db, userId, day),
  });
}
