import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { payState } from "@/lib/dot/pay";
import { balanceFor } from "@/lib/dot/money";
import { todayKST, FREE_TURNS_PER_DAY } from "@/lib/dot/bond";
import PayClient from "./PayClient";

/**
 * **결제창** (10-28 사장님 "결제창 만들고 결제 구현해놔").
 *
 * 지금까지 결제는 대화방 안의 작은 시트뿐이었고, 누르면 "곧 열려요" 한 마디가 돌아왔다.
 * 이 화면이 그 자리를 대신한다 — 무엇을 사는지, 얼마인지, **왜 아직 못 사는지**까지 적는다.
 *
 * "곧 열려요" 를 안 쓰는 이유: 그 말은 사람이 할 수 있는 일이 없다는 뜻인데, 실제로는
 * **계정 연결**은 사람이 지금 할 수 있는 일이다. 둘을 섞으면 할 수 있는 것도 안 하게 된다.
 */
export const metadata = { title: "두근도트 — 멘헤라 모드" };
export const viewport = { width: "device-width", viewportFit: "cover" as const, initialScale: 1, maximumScale: 1, userScalable: false, themeColor: "#1a0d14" };

export default async function DotPay({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const { done } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const 상태 = payState({ signedIn: Boolean(user) });

  /* 이미 켜져 있으면 **사라는 말을 안 한다.** 산 사람에게 또 사라고 하는 화면은 실수다. */
  let 구독중 = false;
  let 만료: string | null = null;
  if (user) {
    const b = await balanceFor(createServiceClient(), user.id, todayKST());
    구독중 = b.구독중;
    만료 = b.menheraUntil;
  }

  return (
    <div className="py-root">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      <style>{CSS}</style>
      <div className="py-phone">
        <header className="py-head">
          <Link href="/dot/chats" className="py-back" aria-label="뒤로">‹</Link>
        </header>

        <div className="py-body">
          <div className="py-badge">멘헤라 모드</div>
          <h1 className="py-title">끝까지 들어 줄게</h1>
          <p className="py-sub">하루 한도 없이, 먼저 말 걸어오는 그 애로.</p>

          <ul className="py-what">
            <li><b>무제한 대화</b><span>하루 {FREE_TURNS_PER_DAY}번 제한이 사라져요</span></li>
            <li><b>선톡</b><span>먼저 말을 걸어와요</span></li>
            <li><b>집착 연출</b><span>말투·배경·표정이 바뀌어요</span></li>
            <li><b>전용 타로 덱</b><span>블랙 덱이 열려요</span></li>
          </ul>

          <div className="py-price">
            <b>{상태.상품.price}</b>
            <span>언제든 끌 수 있어요 · 끄면 낸 기간까지는 그대로 켜져 있어요</span>
          </div>

          {구독중 ? (
            <div className="py-on">
              이미 켜져 있어요
              {만료 && <small>{만료} 까지</small>}
            </div>
          ) : (
            <PayClient 열림={상태.열림} 막는것={상태.막는것} 로그인={Boolean(user)} 방금결제={done === "1"} />
          )}

          <p className="py-fine">
            결제는 Dodo Payments 가 대행해요. 영수증과 세금 처리도 거기서 해 줘요.
            {" "}문의는 <a href="mailto:az51826295@gmail.com">az51826295@gmail.com</a>.
          </p>
          <p className="py-fine">
            <Link href="/dot/privacy">개인정보 처리방침</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

/* 결제창은 **제품 색**으로 둔다 — 설정처럼 밝은 회색으로 두면 "시스템 화면" 처럼 보이고,
   사는 자리는 제품이 제일 자기다워야 하는 자리다. 멘헤라 모드의 그 색을 그대로 쓴다. */
const CSS = `
* { box-sizing:border-box; }
.py-root { min-height:100dvh; background:#0b0710; display:flex; align-items:center; justify-content:center; font-family:"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing:antialiased; }
.py-phone { width:100%; max-width:430px; min-height:100dvh; background:#1a0d14; color:#f3d9e4; display:flex; flex-direction:column; position:relative; overflow:hidden; }
.py-phone::after { content:""; position:absolute; inset:0; pointer-events:none; background:radial-gradient(ellipse at 50% 0%, rgba(224,69,123,.18), transparent 60%); }
.py-head { padding:14px 10px 0; }
.py-back { display:inline-flex; align-items:center; justify-content:center; width:44px; height:44px; font-size:28px; line-height:1; color:#f3d9e4; text-decoration:none; }
.py-body { flex:1; padding:6px 24px 36px; position:relative; z-index:1; }
.py-badge { display:inline-block; font-size:12px; letter-spacing:.5px; color:#fff; background:#e0457b; border-radius:999px; padding:5px 11px; }
.py-title { font-size:28px; font-weight:800; letter-spacing:-.6px; margin:14px 0 6px; color:#fff; }
.py-sub { font-size:15px; color:#b98aa0; margin:0 0 22px; line-height:1.5; }
.py-what { list-style:none; padding:0; margin:0 0 22px; display:flex; flex-direction:column; gap:12px; }
.py-what li { display:flex; flex-direction:column; gap:2px; border-left:2px solid rgba(224,69,123,.5); padding-left:12px; }
.py-what b { font-size:15px; color:#f6dde8; font-weight:600; }
.py-what span { font-size:13px; color:#b98aa0; }
.py-price { background:rgba(224,69,123,.1); border:1px solid rgba(224,69,123,.3); border-radius:16px; padding:16px; margin-bottom:16px; display:flex; flex-direction:column; gap:5px; }
.py-price b { font-size:24px; font-weight:800; color:#fff; }
.py-price span { font-size:12px; color:#b98aa0; line-height:1.5; }
.py-on { background:rgba(224,69,123,.16); border-radius:16px; padding:18px; text-align:center; font-size:16px; font-weight:700; color:#fff; display:flex; flex-direction:column; gap:4px; }
.py-on small { font-size:12px; font-weight:400; color:#d3a8bc; }
.py-fine { font-size:11px; color:#8c7080; line-height:1.6; margin:16px 0 0; }
.py-fine a { color:#b98aa0; }
`;
