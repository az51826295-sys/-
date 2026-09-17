import Link from "next/link";
import { LEGAL_CSS, PRETENDARD } from "../legal-style";

/**
 * 환불 정책 (100회차 09-13, 조건 없는 14일로 바꿈).
 * Paddle 심사는 조건 붙은 환불 문구("안 쓴 만큼만", "검토 후")를 거절 사유로 본다 — 판매자로서 분쟁 책임을 지기 때문.
 * 사장님 "해"(09-13): 결제 후 14일 안에는 이유 묻지 않고 전액. 로그인 없이 열린다.
 */
export const metadata = { title: "Rookery — 환불 정책" };

export default function Refund() {
  return (
    <div className="pv-root">
      <link rel="stylesheet" href={PRETENDARD} />
      <style>{LEGAL_CSS}</style>
      <div className="pv-phone">
        <Link href="/" className="pv-back">‹ Rookery</Link>
        <h1>환불 정책</h1>
        <p className="pv-date">시행일 2026-09-13</p>

        <h2>14일 환불 보장</h2>
        <ul>
          <li>결제한 날로부터 <b>14일 안에는 이유를 묻지 않고 전액 환불</b>해 드려요. 첫 결제와 매달 갱신 결제 모두 해당돼요.</li>
          <li>구독은 언제든 해지할 수 있어요. 해지하면 다음 결제가 되지 않고, 이미 낸 달이 끝날 때까지는 계속 쓸 수 있어요.</li>
        </ul>

        <h2>신청하는 법</h2>
        <p><b>지금은 유료 결제를 받지 않아요.</b> 그래서 환불할 결제도 아직 없어요. 아래는 결제가 열린 뒤에 적용되는 규정이에요.</p>
        <ul>
          <li>결제 대행사가 보낸 영수증 메일의 링크로 신청하거나,</li>
          <li>az51826295@gmail.com 으로 가입 이메일과 결제일을 적어 보내 주세요.</li>
        </ul>
        <p>환불은 결제를 처리한 판매 대행사가 원래 결제 수단으로 돌려드려요. 카드사에 따라 반영까지 며칠 걸릴 수 있어요.</p>

        <h2>Refund policy (English)</h2>
        <p className="pv-en">
          14-day money-back guarantee, no questions asked. If you are not satisfied, request a refund within 14 days of any payment
          (the first payment or a monthly renewal) and you will receive a full refund. You can cancel your subscription at any time;
          it stays active until the end of the paid period and will not renew. Paid subscriptions are not open yet, so there is
          nothing to refund at this time; when payments open, refunds will be processed by the reseller acting as Merchant of Record.
          Contact: az51826295@gmail.com
        </p>
      </div>
    </div>
  );
}
