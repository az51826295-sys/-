import { getLocale } from "@/lib/i18n/server";
/**
 * 계정 삭제 안내 — Play 데이터 보안 설문이 요구하는 "삭제 요청 URL" (09-12).
 * 로그인 없이 열린다(proxy DOT_OPEN 의 /dot 아래이지만 requireLogin 예외에 넣었다).
 */
export async function generateMetadata() {
  const locale = await getLocale();
  return { title: { ko: "두근도트 — 계정 삭제", en: "Dugeun Dot — Delete Account", ja: "ドゥグンドット — アカウント削除" }[locale] }; // i18n-skip: 세 언어를 이 줄에 같이 둔다
}

export default async function DotDeleteAccount() {
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
ul, ol { padding-left:18px; margin:0; }
a { color:#1d4f8a; }
`;

/** 한국어 원본. */
function KoBody() {
  return (
    <>
        <a href="/dot" className="pv-back">‹ 돌아가기</a>
        <h1>계정 삭제</h1>
        <p className="pv-date">두근도트 (개발자 az51826295)</p>

        <h2>앱에서 바로 지우기</h2>
        <ol>
          <li>아래 <b>친구</b> 탭에서 오른쪽 위 <b>⚙ 설정</b>을 누릅니다.</li>
          <li><b>계정 삭제</b>를 누르고, 확인 창에 <b>삭제</b>라고 적습니다.</li>
          <li>즉시 지워지며 되돌릴 수 없습니다.</li>
        </ol>

        <h2>이메일로 요청하기</h2>
        <p>앱에 들어갈 수 없으면 가입한 이메일 주소로 <a href="mailto:az51826295@gmail.com?subject=두근도트 계정 삭제 요청">az51826295@gmail.com</a> 에 "계정 삭제 요청"이라고 보내 주세요. 3일 안에 처리하고 답장을 드립니다.</p>

        <h2>지워지는 것</h2>
        <ul>
          <li>계정(이메일, 비밀번호)</li>
          <li>캐릭터와 나눈 모든 대화, 캐릭터가 기억해 둔 사실, 친밀도</li>
          <li>알림 주소, 좋아요, 팔로우, 충전·구매 기록</li>
        </ul>
        <p>남는 것은 없습니다. 법으로 보관해야 하는 결제 영수증이 생기면 그것만 법정 기간 동안 보관합니다.</p>

        <p><a href="/dot/privacy">개인정보 처리방침 보기</a></p>
    </>
  );
}

/** 10-13 영어 번역 — 원본은 한국어(위). 법률 자문이 아니다: 공개 전에 사람이 한 번 봐야 한다. */
function EnBody() {
  return (
    <>
        <a href="/dot" className="pv-back">‹ Back</a>
        <h1>Delete Account</h1>
        <p className="pv-date">Dugeun Dot (developer az51826295)</p>

        <h2>Delete it in the app</h2>
        <ol>
          <li>In the <b>Friends</b> tab at the bottom, tap <b>⚙ Settings</b> at the top right.</li>
          <li>Tap <b>Delete account</b> and type <b>delete</b> in the confirmation box.</li>
          <li>It is deleted immediately and cannot be undone.</li>
        </ol>

        <h2>Request by email</h2>
        <p>If you can't get into the app, email <a href="mailto:az51826295@gmail.com?subject=Dugeun Dot account deletion request">az51826295@gmail.com</a> from the address you signed up with and write “Account deletion request”. We'll process it within 3 days and reply.</p>

        <h2>What gets deleted</h2>
        <ul>
          <li>Your account (email, password)</li>
          <li>All conversations with characters, facts characters remembered, and closeness</li>
          <li>Notification address, likes, follows, and recharge and purchase records</li>
        </ul>
        <p>Nothing else is kept. If a payment receipt must be kept by law, only that is kept for the legally required period.</p>

        <p><a href="/dot/privacy">View privacy policy</a></p>
        <p className="pv-date">This is a translation. If it differs from the Korean original, the Korean version applies.</p>
    </>
  );
}

/** 10-13 일본어 번역 — 원본은 한국어(위). 법률 자문이 아니다: 공개 전에 사람이 한 번 봐야 한다. */
function JaBody() {
  return (
    <>
        <a href="/dot" className="pv-back">‹ 戻る</a>
        <h1>アカウント削除</h1>
        <p className="pv-date">ドゥグンドット（開発者 az51826295）</p>

        <h2>アプリからすぐに削除する</h2>
        <ol>
          <li>下の<b>友だち</b>タブで、右上の<b>⚙ 設定</b>を押します。</li>
          <li><b>アカウント削除</b>を押し、確認欄に<b>削除</b>と入力します。</li>
          <li>直ちに削除され、元に戻せません。</li>
        </ol>

        <h2>メールで依頼する</h2>
        <p>アプリに入れない場合は、登録したメールアドレスから <a href="mailto:az51826295@gmail.com?subject=ドゥグンドット アカウント削除依頼">az51826295@gmail.com</a> 宛に「アカウント削除依頼」と送ってください。3日以内に対応し、返信します。</p>

        <h2>削除されるもの</h2>
        <ul>
          <li>アカウント（メールアドレス、パスワード）</li>
          <li>キャラクターとのすべてのトーク、キャラクターが覚えた事実、親密度</li>
          <li>通知先、いいね、フォロー、チャージ・購入の記録</li>
        </ul>
        <p>ほかに残るものはありません。法律で保管が必要な決済の領収書が発生した場合は、それのみ法定期間保管します。</p>

        <p><a href="/dot/privacy">プライバシーポリシーを見る</a></p>
        <p className="pv-date">これは翻訳です。韓国語の原文と異なる場合は、韓国語版が優先されます。</p>
    </>
  );
}
