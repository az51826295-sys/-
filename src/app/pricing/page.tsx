import Link from "next/link";
import { SKUS, TRIAL_USD, CREDITS_PER_USD, toCredits } from "@/lib/billing/plans";
import { LEGAL_CSS, PRETENDARD } from "../legal-style";

/**
 * 요금 (100회차 09-13, 월 구독으로 바꿈). Paddle 판매자 심사가 보는 페이지(상품·가격·설명)이자 사람이 보는 요금표.
 * 숫자는 전부 `src/lib/billing/plans.ts` 에서 온다 — 여기 따로 적지 않는다. 로그인 없이 열린다.
 */
export const metadata = { title: "Rookery — 요금 / Pricing" };

export default function Pricing() {
  return (
    <div className="pv-root">
      <link rel="stylesheet" href={PRETENDARD} />
      <style>{LEGAL_CSS}</style>
      <div className="pv-phone">
        <Link href="/" className="pv-back">‹ Rookery</Link>
        <h1>요금</h1>
        <p className="pv-date">월 구독 · 매달 AI 사용량 포함</p>
        <p className="pv-en">
          Rookery is a software-as-a-service (SaaS) product sold as a monthly subscription. Each plan includes a monthly AI usage
          allowance (credits) for tasks such as research, documents, small web apps and short explainer videos, which are generated
          automatically by AI models and delivered digitally in the app. Image generation and 3D model generation are not included
          in any paid plan. Unused credits do not roll over. Cancel anytime.
          14-day money-back guarantee. We do not sell physical goods or human-performed services.
        </p>

        <p>
          로키는 월 구독 소프트웨어예요. 요금제마다 매달 쓸 수 있는 AI 사용량(크레딧)이 들어 있고, 조사·문서·앱·설명 영상처럼 일을
          맡길 때마다 실제로 든 만큼 빠져요. 보통 업무 하나에 30~40 크레딧이 들고, 짧은 질문과 답은 거의 들지 않아요.
          그림 생성과 3D 모델 생성은 유료 요금제에 들어 있지 않아요.
        </p>

        <h2>요금제</h2>
        <div className="pv-plans">
          {SKUS.map((s) => (
            <div className="pv-plan" key={s.id}>
              <div>
                <b>{s.name}</b>
                {s.note && <span>{s.note}</span>}
              </div>
              <strong>{s.priceLabel}</strong>
            </div>
          ))}
        </div>
        <p className="pv-en">가격에는 부가가치세가 포함되며, 결제 나라에 따라 판매 대행사가 세금을 계산해요.</p>

        <h2>처음이라면</h2>
        <p>가입하면 체험 크레딧 {toCredits(TRIAL_USD)}개를 드려요. 업무 두세 개를 맡겨 볼 수 있어요.</p>

        <h2>크레딧은 이렇게 셉니다</h2>
        <ul>
          <li>일을 하는 동안 쓴 AI 모델 사용료를 공표 단가로 계산해 크레딧으로 바꿔요. 원가 1달러가 {CREDITS_PER_USD} 크레딧이에요.</li>
          <li>구독이 갱신될 때마다 그 달 크레딧이 새로 채워져요. 남은 크레딧은 다음 달로 넘어가지 않아요.</li>
          <li>일을 시작하기 전에 크레딧이 남아 있어야 해요. 하던 일은 크레딧이 떨어져도 끝까지 해요.</li>
          <li>크레딧은 현금 가치가 없고 다른 계정으로 옮길 수 없어요.</li>
        </ul>

        <h2>해지와 환불</h2>
        <ul>
          <li>구독은 언제든 해지할 수 있어요. 이미 낸 달이 끝날 때까지는 계속 쓸 수 있어요.</li>
          <li>결제 후 14일 안에는 이유를 묻지 않고 전액 환불해 드려요.</li>
        </ul>

        <h2>결제</h2>
        <p>
          <b>아직 결제를 받지 않아요.</b> 위 가격은 열었을 때의 값이고, 지금은 판매 대행사를 구하는 중이에요. 그때까지는 가입할 때 드리는 체험 크레딧으로 쓰시면 돼요 — 카드도, 결제 정보도 받지 않아요.
          카드 번호는 로키 서버를 지나지 않아요.
        </p>
        <p>
          <a href="/terms">이용약관</a> · <a href="/refund">환불 정책</a> · <a href="/privacy">개인정보 처리방침</a>
        </p>
      </div>
    </div>
  );
}
