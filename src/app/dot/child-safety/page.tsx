import { getLocale } from "@/lib/i18n/server";
/** 아동 안전 표준(CSAE) — Play 콘솔 아동 안전 선언이 요구하는 공개 페이지. 로그인 없이 열린다(proxy 예외). */
export async function generateMetadata() {
  const locale = await getLocale();
  return { title: { ko: "두근도트 — 아동 안전 표준", en: "Dugeun Dot — Child Safety Standards", ja: "ドゥグンドット — 児童の安全に関する基準" }[locale] }; // i18n-skip: 세 언어를 이 줄에 같이 둔다
}

export default async function DotChildSafety() {
  const locale = await getLocale();
  return (
    <div className="pv-root">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      <style>{CSS}</style>
      <div className="pv-phone">
        {locale === "en" ? <EnBody /> : locale === "ja" ? <JaBody /> : <KoBody />}
      </div>
    </div>
  );
}

const CSS = `
* { box-sizing:border-box; }
.pv-root { min-height:100dvh; background:#0b0f14; display:flex; justify-content:center; font-family:"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing:antialiased; }
.pv-phone { width:100%; max-width:430px; min-height:100dvh; background:#fff; padding:20px 22px 48px; color:#141414; }
.pv-back { font-size:14px; color:#7b8590; text-decoration:none; }
h1 { font-size:22px; font-weight:700; margin:16px 0 2px; letter-spacing:-.3px; }
.pv-date { font-size:12px; color:#a3aab3; margin:0 0 18px; }
h2 { font-size:15px; font-weight:600; margin:22px 0 8px; color:#111; }
p, li { font-size:14px; line-height:1.75; color:#3c434b; }
ul { padding-left:18px; margin:0; }
a { color:#1d4f8a; }
`;

/** 한국어 원본. */
function KoBody() {
  return (
    <>
        <a href="/dot" className="pv-back">‹ 돌아가기</a>
        <h1>아동 안전 표준</h1>
        <p className="pv-date">두근도트 · 시행일 2026-09-12</p>

        <h2>1. 원칙</h2>
        <p>두근도트는 아동 성적 학대 및 착취(CSAE)를 어떤 형태로도 허용하지 않습니다. 아동 성적 학대물(CSAM)의 제작·보관·공유·요청, 미성년자에 대한 성적 대화·유인(grooming)·성적 착취, 미성년자를 성적으로 묘사하는 모든 내용을 금지합니다.</p>

        <h2>2. 서비스 성격</h2>
        <p>두근도트는 사용자가 AI 캐릭터와 일대일로 대화하는 앱입니다. 사용자끼리 대화하거나 사진·게시물을 올리는 기능은 없습니다. 만 14세 미만은 이용할 수 없습니다.</p>

        <h2>3. 기술적 조치</h2>
        <ul>
          <li>AI 캐릭터는 성적인 내용을 다루지 않도록 설계되어 있으며, 그런 방향의 대화는 다른 화제로 돌립니다.</li>
          <li>미성년자와 관련된 성적 요청은 응답하지 않습니다.</li>
        </ul>

        <h2>4. 신고</h2>
        <p>앱 안이나 이 앱과 관련해 아동 안전 우려가 있으면 <a href="mailto:az51826295@gmail.com?subject=두근도트 아동 안전 신고">az51826295@gmail.com</a> 으로 알려 주세요. 접수 후 24시간 안에 확인하고, 해당 계정을 즉시 정지합니다.</p>

        <h2>5. 법 준수</h2>
        <p>관련 법률과 각국 규정을 준수하며, CSAM 을 인지하면 관계 당국(대한민국 경찰청 사이버수사국, 필요 시 NCMEC 등)에 보고합니다.</p>

        <h2>6. 담당자</h2>
        <p>아동 안전 담당: az51826295@gmail.com</p>
        <p><a href="/dot/privacy">개인정보 처리방침</a></p>
    </>
  );
}

/** 10-13 영어 번역 — 원본은 한국어(위). 법률 자문이 아니다: 공개 전에 사람이 한 번 봐야 한다. */
function EnBody() {
  return (
    <>
        <a href="/dot" className="pv-back">‹ Back</a>
        <h1>Child Safety Standards</h1>
        <p className="pv-date">Dugeun Dot · Effective 2026-09-12</p>

        <h2>1. Principles</h2>
        <p>Dugeun Dot does not tolerate child sexual abuse and exploitation (CSAE) in any form. We prohibit creating, storing, sharing or requesting child sexual abuse material (CSAM); sexual conversations with, grooming of, or sexual exploitation of minors; and any content that depicts minors sexually.</p>

        <h2>2. About the service</h2>
        <p>Dugeun Dot is an app where users chat one-on-one with AI characters. There is no feature for users to talk to each other or to post photos or posts. Users under 14 may not use this app.</p>

        <h2>3. Technical measures</h2>
        <ul>
          <li>AI characters are designed not to engage with sexual content and steer such conversations to other topics.</li>
          <li>Sexual requests involving minors are not answered.</li>
        </ul>

        <h2>4. Reporting</h2>
        <p>If you have a child-safety concern in or related to this app, please tell us at <a href="mailto:az51826295@gmail.com?subject=Dugeun Dot child safety report">az51826295@gmail.com</a>. We review reports within 24 hours of receipt and suspend the account involved immediately.</p>

        <h2>5. Legal compliance</h2>
        <p>We comply with applicable laws and regulations in each country, and report CSAM to the relevant authorities (the Korean National Police Agency Cyber Investigation Bureau, and NCMEC where necessary) when we become aware of it.</p>

        <h2>6. Contact</h2>
        <p>Child safety contact: az51826295@gmail.com</p>
        <p><a href="/dot/privacy">Privacy policy</a></p>
        <p className="pv-date">This is a translation. If it differs from the Korean original, the Korean version applies.</p>
    </>
  );
}

/** 10-13 일본어 번역 — 원본은 한국어(위). 법률 자문이 아니다: 공개 전에 사람이 한 번 봐야 한다. */
function JaBody() {
  return (
    <>
        <a href="/dot" className="pv-back">‹ 戻る</a>
        <h1>児童の安全に関する基準</h1>
        <p className="pv-date">ドゥグンドット・施行日 2026-09-12</p>

        <h2>1. 原則</h2>
        <p>ドゥグンドットは、児童の性的虐待および搾取（CSAE）をいかなる形でも認めません。児童性的虐待コンテンツ（CSAM）の作成・保存・共有・要求、未成年者との性的な会話・グルーミング・性的搾取、未成年者を性的に描写するあらゆる内容を禁止します。</p>

        <h2>2. サービスの性質</h2>
        <p>ドゥグンドットは、ユーザーがAIキャラクターと1対1で会話するアプリです。ユーザー同士が会話したり、写真や投稿をアップロードしたりする機能はありません。14歳未満の方はご利用いただけません。</p>

        <h2>3. 技術的な措置</h2>
        <ul>
          <li>AIキャラクターは性的な内容を扱わないよう設計されており、そのような方向の会話は別の話題に切り替えます。</li>
          <li>未成年者に関する性的な要求には応答しません。</li>
        </ul>

        <h2>4. 通報</h2>
        <p>アプリ内またはこのアプリに関して児童の安全に関する懸念がある場合は、<a href="mailto:az51826295@gmail.com?subject=ドゥグンドット 児童の安全に関する通報">az51826295@gmail.com</a> までお知らせください。受付後24時間以内に確認し、該当アカウントを直ちに停止します。</p>

        <h2>5. 法令の遵守</h2>
        <p>関連法令および各国の規定を遵守し、CSAMを認知した場合は関係当局（大韓民国警察庁サイバー捜査局、必要に応じてNCMECなど）に報告します。</p>

        <h2>6. 担当者</h2>
        <p>児童の安全担当：az51826295@gmail.com</p>
        <p><a href="/dot/privacy">プライバシーポリシー</a></p>
        <p className="pv-date">これは翻訳です。韓国語の原文と異なる場合は、韓国語版が優先されます。</p>
    </>
  );
}
