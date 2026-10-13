import { getLocale } from "@/lib/i18n/server";
/**
 * 계정 삭제 안내 — Play 데이터 보안 설문이 요구하는 "삭제 요청 URL" (97회차 09-13).
 * 로그인 없이 열린다. 두근도트는 `/dot/delete-account`(별도).
 */
export async function generateMetadata() {
  const locale = await getLocale();
  return { title: { ko: "로키 — 계정 삭제", en: "Rookery — Delete account", ja: "Rookery — アカウント削除" }[locale] }; // i18n-skip: 세 언어를 이 줄에 같이 둔다
}

export default async function RookeryDeleteAccount() {
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

/** 한국어 원본. */
function KoBody() {
  return (
    <>
        <a href="/ask" className="pv-back">‹ 돌아가기</a>
        <h1>계정 삭제</h1>
        <p className="pv-date">로키 (개발자 az51826295)</p>

        <h2>앱에서 바로 지우기</h2>
        <ol>
          <li>왼쪽 위 계정 메뉴를 누릅니다.</li>
          <li><b>계정 삭제</b>를 누르고, 확인 창에 <b>삭제</b>라고 적습니다.</li>
          <li>즉시 지워지며 되돌릴 수 없습니다.</li>
        </ol>

        <h2>이메일로 요청하기</h2>
        <p>앱에 들어갈 수 없으면 가입한 이메일 주소로 <a href="mailto:az51826295@gmail.com?subject=로키 계정 삭제 요청">az51826295@gmail.com</a> 에 &quot;계정 삭제 요청&quot;이라고 보내 주세요. 3일 안에 처리하고 답장을 드립니다.</p>

        <h2>지워지는 것</h2>
        <ul>
          <li>계정(이메일, 비밀번호)</li>
          <li>만든 회사·등록한 AI 직원 구성</li>
          <li>모든 대화·업무·산출물(문서·이미지·코드 등)</li>
        </ul>

        <p><a href="/privacy">개인정보 처리방침</a></p>
    </>
  );
}

/** 10-14 영어 번역. 확인 창에 치는 낱말은 화면 언어를 따른다(AskShell: 영어면 DELETE). */
function EnBody() {
  return (
    <>
        <a href="/ask" className="pv-back">‹ Back</a>
        <h1>Delete account</h1>
        <p className="pv-date">Rookery (developer az51826295)</p>

        <h2>Delete it in the app</h2>
        <ol>
          <li>Tap the account menu at the top left.</li>
          <li>Tap <b>Delete account</b> and type <b>DELETE</b> in the confirmation box.</li>
          <li>It’s deleted immediately and cannot be undone.</li>
        </ol>

        <h2>Request by email</h2>
        <p>If you can’t get into the app, send “Account deletion request” from the email address you signed up with to <a href="mailto:az51826295@gmail.com?subject=Rookery account deletion request">az51826295@gmail.com</a>. We’ll process it within 3 days and reply.</p>

        <h2>What gets deleted</h2>
        <ul>
          <li>Your account (email, password)</li>
          <li>The company you created and your AI worker setup</li>
          <li>All chats, work and results (documents, images, code, etc.)</li>
        </ul>

        <p><a href="/privacy">Privacy Policy</a></p>
    </>
  );
}

/** 10-14 일본어 번역. */
function JaBody() {
  return (
    <>
        <a href="/ask" className="pv-back">‹ 戻る</a>
        <h1>アカウント削除</h1>
        <p className="pv-date">Rookery（開発者 az51826295）</p>

        <h2>アプリですぐ削除する</h2>
        <ol>
          <li>左上のアカウントメニューを押します。</li>
          <li><b>アカウント削除</b>を押し、確認欄に<b>削除</b>と入力します。</li>
          <li>すぐに削除され、元に戻せません。</li>
        </ol>

        <h2>メールで依頼する</h2>
        <p>アプリに入れない場合は、登録したメールアドレスから <a href="mailto:az51826295@gmail.com?subject=Rookery アカウント削除依頼">az51826295@gmail.com</a> に「アカウント削除依頼」と送ってください。3日以内に処理してご返信します。</p>

        <h2>削除されるもの</h2>
        <ul>
          <li>アカウント（メールアドレス、パスワード）</li>
          <li>作成した会社・登録したAIスタッフの構成</li>
          <li>すべての会話・業務・成果物（文書・画像・コードなど）</li>
        </ul>

        <p><a href="/privacy">プライバシーポリシー</a></p>
    </>
  );
}

const CSS = `
* { box-sizing:border-box; }
.pv-root { min-height:100dvh; background:#0a0a0a; display:flex; justify-content:center; font-family:"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing:antialiased; }
.pv-phone { width:100%; max-width:560px; min-height:100dvh; background:#111; padding:24px 24px 56px; color:#eee; }
.pv-back { font-size:14px; color:#9a9a9a; text-decoration:none; }
h1 { font-size:22px; font-weight:700; margin:16px 0 2px; letter-spacing:-.3px; color:#fff; }
.pv-date { font-size:12px; color:#8a8a8a; margin:0 0 18px; }
h2 { font-size:15px; font-weight:600; margin:22px 0 8px; color:#E0703A; }
p, li { font-size:14px; line-height:1.75; color:#cfcfcf; }
ul, ol { padding-left:18px; margin:0; }
a { color:#E0703A; }
`;
