import Link from "next/link";
import { LEGAL_CSS, PRETENDARD } from "../legal-style";
import { getLocale } from "@/lib/i18n/server";

/**
 * 이용약관 (100회차 09-13). Paddle 판매자 심사가 보는 것: "Paddle 이 판매자(Merchant of Record)" 문장, 운영자 이름이
 * Paddle 계정 이름과 같을 것, 소프트웨어라는 것, 월 구독·해지·환불이 분명할 것. 사장님 "해"(09-13) — 운영자 이름 공개 동의.
 * 법률 자문이 아니다. 로그인 없이 열린다.
 */
export async function generateMetadata() {
  const locale = await getLocale();
  return { title: { ko: "Rookery — 이용약관", en: "Rookery — Terms of Service", ja: "Rookery — 利用規約" }[locale] }; // i18n-skip: 세 언어를 이 줄에 같이 둔다
}

export default async function Terms() {
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

/** 한국어 원본. */
function KoBody() {
  return (
    <>
        <Link href="/" className="pv-back">‹ Rookery</Link>
        <h1>이용약관</h1>
        <p className="pv-date">시행일 2026-09-13</p>

        <h2>1. 서비스와 운영자</h2>
        <p>
          Rookery(로키)는 여러 생성 AI를 지휘해 조사·문서·앱·설명 영상 같은 결과물을 만들고, 사용자가 그 결과를 판정하는 온라인
          소프트웨어 서비스입니다. 모든 결과물은 AI 모델이 자동으로 만들어 앱 안에서 디지털로 제공되며, 실물 상품이나 사람이 직접 하는
          용역은 팔지 않습니다. 유료 요금제에는 그림 생성과 3D 모델 생성이 들어 있지 않습니다.
        </p>
        <p>운영자: 권혁수 (Kwon Hyeoksu), 개인 판매자, 대한민국 · 문의 az51826295@gmail.com</p>
        <p className="pv-en">
          Rookery is AI software (SaaS) operated by Kwon Hyeoksu, a sole proprietor based in the Republic of Korea. All results are
          generated automatically by AI models and delivered digitally in the app. We do not sell physical goods or human-performed services.
        </p>

        <h2>2. 계정</h2>
        <ul>
          <li>만 14세 이상만 가입할 수 있습니다.</li>
          <li>계정과 비밀번호는 본인이 관리합니다. 계정은 메뉴의 “계정 삭제”로 언제든 지울 수 있습니다.</li>
        </ul>

        <h2>3. 구독과 결제</h2>
        <ul>
          <li>유료 기능은 월 구독으로 이용합니다. 요금제와 가격은 <a href="/pricing">요금</a> 페이지에 있습니다.</li>
          <li>각 요금제에는 매달 쓸 수 있는 AI 사용량(크레딧)이 들어 있습니다. 크레딧은 맡긴 일에 실제로 든 AI 사용량만큼 차감되고, 매달 갱신 때 새로 채워지며, 남은 크레딧은 다음 달로 넘어가지 않습니다. 크레딧은 현금 가치가 없고 다른 계정으로 옮길 수 없습니다.</li>
          <li>구독은 언제든 해지할 수 있습니다. 해지하면 다음 결제가 되지 않고, 이미 낸 달이 끝날 때까지 계속 쓸 수 있습니다.</li>
          <li>
            <b>현재 유료 결제를 받고 있지 않습니다.</b> 결제 수단이 준비되면 주문을 처리할 판매 대행사(Merchant of Record)를 이 자리에 밝히고, 그 전에는 어떤 금액도 청구하지 않습니다. 지금은 가입 시 드리는 체험 크레딧으로만 이용할 수 있습니다.
            <span className="pv-en"> Paid subscriptions are not currently available. When payments open we will name the reseller acting as Merchant of Record here. Until then nothing is charged, and the service is used with the free trial credits given at sign-up.</span>
          </li>
          <li>결제 후 14일 안에는 이유를 묻지 않고 전액 환불합니다. 자세한 내용은 <a href="/refund">환불 정책</a>을 보세요.</li>
        </ul>

        <h2>4. AI 결과물</h2>
        <ul>
          <li>결과물은 AI가 만든 것이라 틀리거나 부정확할 수 있습니다. 중요한 결정에 쓰기 전에 직접 확인해 주세요.</li>
          <li>사용자가 만든 결과물의 이용 권리는 사용자에게 있습니다. 다만 AI 모델 제공사의 이용 정책을 함께 따라야 합니다.</li>
          <li>부적절한 답이나 결과물은 앱 안의 “신고”로 알려 주세요.</li>
        </ul>

        <h2>5. 금지 행위</h2>
        <ul>
          <li>법을 어기거나 타인의 권리를 침해하는 목적의 사용</li>
          <li>악성 코드, 스팸, 사기, 성적으로 노골적인 콘텐츠를 만들게 하는 사용</li>
          <li>서비스를 과도하게 자동 호출하거나 보안 장치를 우회하려는 시도</li>
        </ul>
        <p>이를 어기면 이용이 제한되거나 계정이 해지될 수 있습니다.</p>

        <h2>6. 책임의 한계</h2>
        <p>서비스는 제공되는 상태 그대로 제공됩니다. 법이 허용하는 범위에서, 운영자의 책임은 문제가 된 달에 사용자가 결제한 금액을 넘지 않습니다.</p>

        <h2>7. 변경</h2>
        <p>약관을 바꿀 때는 시행 7일 전에 서비스 안에서 알립니다.</p>

        <h2>8. 문의</h2>
        <p>az51826295@gmail.com</p>
    </>
  );
}

/** 10-14 영어 번역 — 원본은 한국어(위). 법률 자문이 아니다: 공개 전에 사람이 한 번 봐야 한다. */
function EnBody() {
  return (
    <>
        <Link href="/" className="pv-back">‹ Rookery</Link>
        <h1>Terms of Service</h1>
        <p className="pv-date">Effective 2026-09-13</p>

        <h2>1. The service and operator</h2>
        <p>
          Rookery is an online software service that directs multiple generative AIs to produce results such as research, documents, apps and
          explainer videos, which you then review. All results are generated automatically by AI models and delivered digitally in the app. We do
          not sell physical goods or human-performed services. Paid plans do not include image generation or 3D model generation.
        </p>
        <p>Operator: Kwon Hyeoksu, sole proprietor, Republic of Korea · Contact az51826295@gmail.com</p>

        <h2>2. Accounts</h2>
        <ul>
          <li>You must be at least 14 years old to sign up.</li>
          <li>You are responsible for your account and password. You can delete your account at any time with “Delete account” in the menu.</li>
        </ul>

        <h2>3. Subscriptions and payment</h2>
        <ul>
          <li>Paid features are offered as monthly subscriptions. Plans and prices are on the <a href="/pricing">Pricing</a> page.</li>
          <li>Each plan includes a monthly AI usage allowance (credits). Credits are deducted by the AI usage actually spent on the work you assign, refill at each monthly renewal, and do not roll over. Credits have no cash value and cannot be transferred to another account.</li>
          <li>You can cancel at any time. After cancelling you will not be charged again, and you can keep using the service until the end of the month you paid for.</li>
          <li>
            <b>Paid subscriptions are not currently available.</b> When payments open we will name the reseller acting as Merchant of Record here; until then nothing is charged. For now the service is used only with the trial credits given at sign-up.
          </li>
          <li>Within 14 days of payment we refund in full, no questions asked. See the <a href="/refund">Refund Policy</a> for details.</li>
        </ul>

        <h2>4. AI results</h2>
        <ul>
          <li>Results are made by AI and may be wrong or inaccurate. Please check them yourself before using them for important decisions.</li>
          <li>You hold the rights to use the results you create, subject to the usage policies of the AI model providers.</li>
          <li>Please report inappropriate answers or results with “Report” in the app.</li>
        </ul>

        <h2>5. Prohibited use</h2>
        <ul>
          <li>Using the service to break the law or infringe the rights of others</li>
          <li>Having it produce malware, spam, scams or sexually explicit content</li>
          <li>Excessive automated calls or attempts to bypass security measures</li>
        </ul>
        <p>Violations may lead to restricted use or termination of your account.</p>

        <h2>6. Limitation of liability</h2>
        <p>The service is provided as is. To the extent permitted by law, the operator’s liability will not exceed the amount you paid in the month in question.</p>

        <h2>7. Changes</h2>
        <p>We will announce changes to these terms in the service 7 days before they take effect.</p>

        <h2>8. Contact</h2>
        <p>az51826295@gmail.com</p>
        <p className="pv-date">This is a translation. If it differs from the Korean original, the Korean version applies.</p>
    </>
  );
}

/** 10-14 일본어 번역 — 원본은 한국어(위). 법률 자문이 아니다: 공개 전에 사람이 한 번 봐야 한다. */
function JaBody() {
  return (
    <>
        <Link href="/" className="pv-back">‹ Rookery</Link>
        <h1>利用規約</h1>
        <p className="pv-date">施行日 2026-09-13</p>

        <h2>1. サービスと運営者</h2>
        <p>
          Rookeryは、複数の生成AIを指揮して調査・文書・アプリ・説明動画などの成果物を作り、ユーザーがその結果を判定するオンラインのソフトウェアサービスです。
          すべての成果物はAIモデルが自動で作り、アプリ内でデジタルで提供されます。実物の商品や人が直接行う役務は販売しません。有料プランには画像生成と3Dモデル生成は含まれません。
        </p>
        <p>運営者：権赫洙（Kwon Hyeoksu）、個人事業者、大韓民国 · お問い合わせ az51826295@gmail.com</p>

        <h2>2. アカウント</h2>
        <ul>
          <li>14歳以上の方のみ登録できます。</li>
          <li>アカウントとパスワードはご自身で管理してください。アカウントはメニューの「アカウント削除」でいつでも削除できます。</li>
        </ul>

        <h2>3. 購読とお支払い</h2>
        <ul>
          <li>有料機能は月額購読でご利用いただけます。プランと価格は<a href="/pricing">料金</a>ページにあります。</li>
          <li>各プランには毎月使えるAI利用量（クレジット）が含まれます。クレジットは任せた仕事に実際にかかったAI利用量だけ差し引かれ、毎月の更新時に補充され、残ったクレジットは翌月に繰り越されません。クレジットに現金価値はなく、他のアカウントへ移すことはできません。</li>
          <li>購読はいつでも解約できます。解約すると次回の請求は行われず、支払い済みの月が終わるまで引き続き利用できます。</li>
          <li>
            <b>現在、有料のお支払いは受け付けていません。</b>決済手段が整い次第、注文を処理する販売代理店（Merchant of Record）をここに明記し、それまではいかなる金額も請求しません。現在は登録時にお渡しする体験クレジットでのみご利用いただけます。
          </li>
          <li>お支払いから14日以内であれば、理由を問わず全額返金します。詳しくは<a href="/refund">返金ポリシー</a>をご覧ください。</li>
        </ul>

        <h2>4. AIの成果物</h2>
        <ul>
          <li>成果物はAIが作ったもののため、誤りや不正確な内容を含むことがあります。重要な判断に使う前にご自身で確認してください。</li>
          <li>ユーザーが作った成果物の利用権はユーザーにあります。ただし、AIモデル提供元の利用ポリシーにも従う必要があります。</li>
          <li>不適切な回答や成果物は、アプリ内の「報告」でお知らせください。</li>
        </ul>

        <h2>5. 禁止事項</h2>
        <ul>
          <li>法律に違反する、または他人の権利を侵害する目的での利用</li>
          <li>マルウェア、スパム、詐欺、性的に露骨なコンテンツを作らせる利用</li>
          <li>サービスを過度に自動呼び出ししたり、セキュリティ機能を回避しようとする行為</li>
        </ul>
        <p>これらに違反した場合、利用が制限されたりアカウントが解除されることがあります。</p>

        <h2>6. 責任の制限</h2>
        <p>サービスは現状のまま提供されます。法律が許す範囲で、運営者の責任は問題となった月にユーザーが支払った金額を超えません。</p>

        <h2>7. 変更</h2>
        <p>規約を変更する際は、施行の7日前にサービス内でお知らせします。</p>

        <h2>8. お問い合わせ</h2>
        <p>az51826295@gmail.com</p>
        <p className="pv-date">これは翻訳です。韓国語の原文と異なる場合は、韓国語版が優先されます。</p>
    </>
  );
}
