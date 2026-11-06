import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { todayKST, CHECKIN_HEARTS } from "@/lib/dot/bond";
import { balanceFor, HEART_PACKS, heartBillingOpen, AD_REFILLS_PER_DAY, AD_REFILL_TURNS } from "@/lib/dot/money";
import PayClient from "./PayClient";

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
export default async function HeartStore() {
  let hearts = 0;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
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
          <Link href="/dot/chats" className="py-back" aria-label="뒤로">‹</Link>
          <div className="py-title">하트 사기</div>
        </header>

        <div className="py-now"><b>♥</b> 지금 하트 {hearts}개</div>

        <PayClient packs={HEART_PACKS} open={heartBillingOpen()} />

        {/* 공짜 길을 숨기지 않는다 — 숨기면 "돈을 내야만 되는 앱" 으로 읽힌다. */}
        <div className="py-free">
          출석하면 하루 하트 {CHECKIN_HEARTS}개, 광고를 보면 {AD_REFILLS_PER_DAY}번까지 하트 {AD_REFILL_TURNS}개씩 더 받아요.
        </div>
      </div>
    </div>
  );
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
.py-free { margin-top:16px; font-size:12px; color:#8a8f98; line-height:1.6; text-align:center; }
`;
