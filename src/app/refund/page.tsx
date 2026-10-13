import Link from "next/link";
import { LEGAL_CSS, PRETENDARD } from "../legal-style";
import { getLocale } from "@/lib/i18n/server";

/**
 * 환불 정책 (100회차 09-13, 조건 없는 14일로 바꿈).
 * Paddle 심사는 조건 붙은 환불 문구("안 쓴 만큼만", "검토 후")를 거절 사유로 본다 — 판매자로서 분쟁 책임을 지기 때문.
 * 사장님 "해"(09-13): 결제 후 14일 안에는 이유 묻지 않고 전액. 로그인 없이 열린다.
 */
export async function generateMetadata() {
  const locale = await getLocale();
  return { title: { ko: "Rookery — 환불 정책", en: "Rookery — Refund Policy", ja: "Rookery — 返金ポリシー" }[locale] }; // i18n-skip: 세 언어를 이 줄에 같이 둔다
}

export default async function Refund() {
  const locale = await getLocale();
  return (
    <div className="pv-root">
      <link rel="stylesheet" href={PRETENDARD} />
      <style>{LEGAL_CSS}</style>
      <div className="pv-phone">
        {locale === "en" ? <EnBody /> : locale === "ja" ? <JaBody /> : <KoBody />}
      </div>
    </div>
  );
}

/** 한국어 원본(아래 영어 단락은 결제 대행사 심사용으로 원래 있던 것). */
function KoBody() {
  return (
    <>
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
    </>
  );
}

/** 10-14 영어 번역 — 원본은 한국어(위). */
function EnBody() {
  return (
    <>
        <Link href="/" className="pv-back">‹ Rookery</Link>
        <h1>Refund Policy</h1>
        <p className="pv-date">Effective 2026-09-13</p>

        <h2>14-day money-back guarantee</h2>
        <ul>
          <li>Within <b>14 days of the payment date we refund in full, no questions asked</b>. This applies to both the first payment and each monthly renewal.</li>
          <li>You can cancel your subscription at any time. After cancelling you won’t be charged again, and you can keep using it until the end of the month you paid for.</li>
        </ul>

        <h2>How to request</h2>
        <p><b>We are not taking paid payments right now.</b> So there are no payments to refund yet. The rules below apply once payments open.</p>
        <ul>
          <li>Request through the link in the receipt email from the payment reseller, or</li>
          <li>email az51826295@gmail.com with your sign-up email and the payment date.</li>
        </ul>
        <p>Refunds are returned to the original payment method by the reseller that processed the payment. Depending on your card issuer, it may take a few days to appear.</p>
        <p className="pv-date">This is a translation. If it differs from the Korean original, the Korean version applies.</p>
    </>
  );
}

/** 10-14 일본어 번역 — 원본은 한국어(위). */
function JaBody() {
  return (
    <>
        <Link href="/" className="pv-back">‹ Rookery</Link>
        <h1>返金ポリシー</h1>
        <p className="pv-date">施行日 2026-09-13</p>

        <h2>14日間返金保証</h2>
        <ul>
          <li>お支払い日から<b>14日以内であれば、理由を問わず全額返金</b>します。初回のお支払いと毎月の更新のお支払いのどちらも対象です。</li>
          <li>購読はいつでも解約できます。解約すると次回の請求は行われず、支払い済みの月が終わるまで引き続き使えます。</li>
        </ul>

        <h2>申請方法</h2>
        <p><b>現在、有料のお支払いは受け付けていません。</b>そのため返金するお支払いもまだありません。以下はお支払い開始後に適用される規定です。</p>
        <ul>
          <li>決済代行会社から届いた領収書メールのリンクから申請するか、</li>
          <li>az51826295@gmail.com に登録メールアドレスとお支払い日を書いて送ってください。</li>
        </ul>
        <p>返金は、お支払いを処理した販売代理店が元のお支払い方法に戻します。カード会社によっては反映まで数日かかることがあります。</p>
        <p className="pv-date">これは翻訳です。韓国語の原文と異なる場合は、韓国語版が優先されます。</p>
    </>
  );
}
