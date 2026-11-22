import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { todayKST, CHECKIN_HEARTS } from "@/lib/dot/bond";
import { balanceFor, HEART_PACKS, heartBillingOpen, AD_REFILLS_PER_DAY, AD_REFILL_TURNS } from "@/lib/dot/money";
import { cookies } from "next/headers";
import { claimCheckout, polarOpen, POLAR_COOKIE } from "@/lib/dot/polar";
import PayClient from "./PayClient";
import { langFromCookie } from "@/lib/dot/langServer";

/**
 * **하트 결제창** (11-06 사장님 "하트 결제창으로 넘어가자").
 *
 * 이 주소는 아침까지 멘헤라 구독을 팔던 자리였다. 구독을 없애면서 피드로 보내는 세 줄만
 * 남겼는데, 하트를 팔기로 하면서 **하트 가게**로 다시 열었다.
 *
 * ⚠ 아직 **돈을 받을 길이 없다**(Play 열쇠·은행 인증, 웹 결제 승인 대기). 사장님이
 * *"결제창까지 보이고 준비 중"* 으로 정하셔서 묶음은 내밀되 누르면 "곧 열려요" 로 답한다.
 * 파는 길이 열리면 `HEART_BILLING_OPEN=1` 만 켜면 된다.
 */
export default async function HeartStore({ searchParams }: { searchParams: Promise<{ paid?: string }> }) {
  const { paid } = await searchParams;
  const en = (await langFromCookie()) === "en";
  let hearts = 0;
  let 손님 = true;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    손님 = !user || !!user.is_anonymous;
    if (user) {
      /* 11-22 웹 결제: 결제창을 열어 두고 안 돌아온 사람 — 여기서 한 번 더 Polar 에 묻는다(몇 번 물어도 한 번만 준다). */
      const 열어둔 = (await cookies()).get(POLAR_COOKIE)?.value;
      if (열어둔 && polarOpen()) await claimCheckout(createServiceClient(), user.id, 열어둔).catch(() => null);
      const b = await balanceFor(createServiceClient(), user.id, todayKST());
      hearts = Number.isFinite(b.remaining) ? b.remaining : 0;
    }
  } catch { /* 장부를 못 읽어도 가게는 열린다 — 숫자만 0 으로 보인다 */ }

  return (
    <div className="py-root">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      <style>{CSS}</style>
      <div className="py-phone">
        <header className="py-head">
          <Link href="/dot/chats" className="py-back" aria-label={en ? "Back" : "뒤로"}>‹</Link>
          <div className="py-title">{en ? "Get hearts" : "하트 사기"}</div>
        </header>

        <div className="py-now"><b>♥</b> {en ? `You have ${hearts} hearts` : `지금 하트 ${hearts}개`}</div>

        {/* 11-22: 손님 계정에 산 하트는 브라우저를 지우면 같이 사라진다 — 사기 전에 말해 준다. */}
        {손님 && (
          <Link href="/dot/login" className="py-login">
            {en ? <><b>Sign in</b> first so you never lose hearts you buy ›</> : <>산 하트를 잃어버리지 않으려면 <b>로그인</b>하고 사세요 ›</>}
          </Link>
        )}

        {paid && <div className={/^\d+$/.test(paid) ? "py-ok" : "py-wait"}>{결과글(paid, en)}</div>}

        <PayClient packs={HEART_PACKS} open={{ play: heartBillingOpen(), web: polarOpen() }} lang={en ? "en" : "ko"} />

        {/* 공짜 길을 숨기지 않는다 — 숨기면 "돈을 내야만 되는 앱" 으로 읽힌다. */}
        <div className="py-free">
          {en
            ? `Check in daily for ${CHECKIN_HEARTS} free hearts, and watch up to ${AD_REFILLS_PER_DAY} ads for ${AD_REFILL_TURNS} more each.`
            : `출석하면 하루 하트 ${CHECKIN_HEARTS}개, 광고를 보면 ${AD_REFILLS_PER_DAY}번까지 하트 ${AD_REFILL_TURNS}개씩 더 받아요.`}
        </div>
      </div>
    </div>
  );
}

function 결과글(p: string, en = false) {
  if (/^\d+$/.test(p)) return en ? `${p} hearts added. Thank you!` : `하트 ${p}개가 들어왔어요. 고마워요!`;
  if (p === "wait") return en ? "Your payment isn't finished yet. Come back to this page once it is." : "결제가 아직 끝나지 않았어요. 끝나면 이 화면에 다시 오면 들어와요.";
  if (p === "login") return en ? "Open any chat once, then come back — your hearts will be added." : "대화방에 한 번 들어갔다 오면 하트가 들어와요.";
  return en ? "We couldn't confirm it. If you were charged but got no hearts, contact us from Settings." : "확인이 안 됐어요. 돈이 빠졌는데 하트가 없으면 설정 > 문의로 알려 주세요.";
}

const CSS = `
.py-root { min-height:100dvh; background:#f7f8fa; display:flex; justify-content:center;
  font-family:Pretendard Variable, Pretendard, system-ui, sans-serif; color:#141414; }
.py-phone { width:100%; max-width:430px; padding:0 16px 32px; }
.py-head { display:flex; align-items:center; gap:6px; padding:10px 0; }
.py-back { display:inline-flex; align-items:center; justify-content:center; width:40px; height:40px; font-size:24px; color:#141414; text-decoration:none; }
.py-title { font-size:20px; font-weight:700; letter-spacing:-.3px; }
.py-now { margin:6px 0 16px; font-size:15px; font-weight:700; }
.py-now b { color:#ff5c7a; }
.py-login { display:flex; align-items:center; min-height:44px; margin:0 0 12px; padding:8px 12px; background:#f0edff; color:#3f3597; border-radius:10px; font-size:13px; text-decoration:none; }
.py-ok { margin:0 0 12px; padding:10px 12px; background:#e9f8ef; color:#17663a; border-radius:10px; font-size:13px; text-align:center; }
.py-wait { margin:0 0 12px; padding:10px 12px; background:#fff4e5; color:#8a5a00; border-radius:10px; font-size:13px; text-align:center; }
.py-free { margin-top:16px; font-size:12px; color:#8a8f98; line-height:1.6; text-align:center; }
`;
