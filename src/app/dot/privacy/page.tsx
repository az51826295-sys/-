import Link from "next/link";
import { getLocale } from "@/lib/i18n/server";
/**
 * 개인정보 처리방침 — 스토어 등록에 필수(38회차, 09-11).
 *
 * 문구는 초안이다. 이 앱이 실제로 하는 것만 적었다(모아 두는 것·쓰는 곳·지우는 법). 사장님이 읽고 고친다.
 * 법률 자문이 아니다 — 등록 전에 한 번은 사람이 봐야 한다.
 */
export async function generateMetadata() {
  const locale = await getLocale();
  return { title: { ko: "두근도트 — 개인정보 처리방침", en: "Dugeun Dot — Privacy Policy", ja: "ドゥグンドット — プライバシーポリシー" }[locale] }; // i18n-skip: 세 언어를 이 줄에 같이 둔다
}

export default async function DotPrivacy() {
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
/* 09-29 UI 점검: 돌아가기가 20px 높이라 손가락이 빗나갔다. */
.pv-back { font-size:14px; color:#7b8590; text-decoration:none; display:inline-flex; align-items:center; min-height:44px; padding-right:14px; }
h1 { font-size:22px; font-weight:700; margin:16px 0 2px; letter-spacing:-.3px; }
.pv-date { font-size:12px; color:#a3aab3; margin:0 0 18px; }
h2 { font-size:15px; font-weight:600; margin:22px 0 8px; color:#111; }
p, li { font-size:14px; line-height:1.75; color:#3c434b; }
ul { padding-left:18px; margin:0; }
`;

/** 한국어 원본. */
function KoBody() {
  return (
    <>
        <a href="/dot" className="pv-back">‹ 돌아가기</a>
        <h1>개인정보 처리방침</h1>
        <p className="pv-date">시행일 2026-09-11 (초안)</p>

        <h2>1. 모아 두는 것</h2>
        <ul>
          <li><b>계정</b>: 이메일, 비밀번호(암호화된 형태로만).</li>
          <li><b>대화</b>: 캐릭터와 주고받은 말, 캐릭터가 기억해 둔 사실(당신이 직접 말한 것만), 친밀도 점수.</li>
          <li><b>사용 기록</b>: 하루에 몇 번 이야기했는지, 답이 오기까지 걸린 시간(서비스 개선용).</li>
          <li><b>알림 주소</b>: "알림 켜기" 를 누른 기기의 푸시 주소(끄면 지워집니다).</li>
          <li>이 앱은 이름·전화번호·위치·연락처·사진을 요구하지 않습니다.</li>
        </ul>

        <h2>2. 어디에 쓰나</h2>
        <ul>
          <li>캐릭터가 대화를 이어 가고 당신을 기억하는 데 씁니다.</li>
          <li>대화 내용은 AI 언어 모델 제공사(DeepSeek)에 <b>답을 만들기 위해</b> 전송됩니다. 광고·판매 목적으로 제3자에게 넘기지 않습니다.</li>
          <li>데이터는 Supabase(싱가포르 리전)에 저장됩니다.</li>
        </ul>

        <h2>3. 지우는 법</h2>
        <ul>
          <li>대화방 메뉴(⋮) → <b>대화 내용 지우기</b>: 그 캐릭터와의 대화가 지워집니다.</li>
          <li>대화방 메뉴(⋮) → <b>계정 삭제</b>: 계정·대화·기억·친밀도·알림 주소가 <b>즉시, 전부</b> 지워지며 되돌릴 수 없습니다.</li>
        </ul>

        <h2>4. 연령</h2>
        <p>만 14세 미만은 이용할 수 없습니다.</p>

        <h2>5. 문의</h2>
        <p>az51826295@gmail.com</p>
    </>
  );
}

/** 10-13 영어 번역 — 원본은 한국어(위). 법률 자문이 아니다: 공개 전에 사람이 한 번 봐야 한다. */
function EnBody() {
  return (
    <>
        <Link href="/dot" className="pv-back">‹ Back</Link>
        <h1>Privacy Policy</h1>
        <p className="pv-date">Effective 2026-09-11 (draft)</p>

        <h2>1. What we keep</h2>
        <ul>
          <li><b>Account</b>: email and password (stored only in encrypted form).</li>
          <li><b>Conversations</b>: messages exchanged with characters, facts a character remembers (only things you told it yourself), and your closeness score.</li>
          <li><b>Usage records</b>: how many times you chatted per day and how long replies took (to improve the service).</li>
          <li><b>Notification address</b>: the push address of the device where you tapped “Turn on notifications” (deleted when you turn them off).</li>
          <li>This app does not ask for your name, phone number, location, contacts or photos.</li>
        </ul>

        <h2>2. How we use it</h2>
        <ul>
          <li>To let characters continue conversations and remember you.</li>
          <li>Conversation content is sent to an AI language model provider (DeepSeek) <b>to generate replies</b>. We do not pass it to third parties for advertising or sale.</li>
          <li>Data is stored with Supabase (Singapore region).</li>
        </ul>

        <h2>3. How to delete it</h2>
        <ul>
          <li>Chat menu (⋮) → <b>Delete chat history</b>: deletes your conversation with that character.</li>
          <li>Chat menu (⋮) → <b>Delete account</b>: your account, conversations, memories, closeness and notification address are deleted <b>immediately and completely</b>, and this cannot be undone.</li>
        </ul>

        <h2>4. Age</h2>
        <p>Users under 14 may not use this app.</p>

        <h2>5. Contact</h2>
        <p>az51826295@gmail.com</p>
        <p className="pv-date">This is a translation. If it differs from the Korean original, the Korean version applies.</p>
    </>
  );
}

/** 10-13 일본어 번역 — 원본은 한국어(위). 법률 자문이 아니다: 공개 전에 사람이 한 번 봐야 한다. */
function JaBody() {
  return (
    <>
        <Link href="/dot" className="pv-back">‹ 戻る</Link>
        <h1>プライバシーポリシー</h1>
        <p className="pv-date">施行日 2026-09-11（草案）</p>

        <h2>1. 保存する情報</h2>
        <ul>
          <li><b>アカウント</b>：メールアドレス、パスワード（暗号化した形でのみ）。</li>
          <li><b>会話</b>：キャラクターとやり取りしたメッセージ、キャラクターが覚えた事実（あなた自身が話したことのみ）、親密度。</li>
          <li><b>利用記録</b>：1日に何回話したか、返事が届くまでにかかった時間（サービス改善のため）。</li>
          <li><b>通知先</b>：「通知をオン」を押した端末のプッシュ通知先（オフにすると削除されます）。</li>
          <li>このアプリは、名前・電話番号・位置情報・連絡先・写真を求めません。</li>
        </ul>

        <h2>2. 利用目的</h2>
        <ul>
          <li>キャラクターが会話を続け、あなたを覚えておくために使います。</li>
          <li>会話内容は、<b>返事を作るために</b>AI言語モデルの提供会社（DeepSeek）へ送信されます。広告や販売を目的として第三者に提供することはありません。</li>
          <li>データはSupabase（シンガポールリージョン）に保存されます。</li>
        </ul>

        <h2>3. 削除の方法</h2>
        <ul>
          <li>トークメニュー（⋮）→ <b>トーク内容を削除</b>：そのキャラクターとのトークが削除されます。</li>
          <li>トークメニュー（⋮）→ <b>アカウント削除</b>：アカウント・トーク・記憶・親密度・通知先が<b>直ちに、すべて</b>削除され、元に戻せません。</li>
        </ul>

        <h2>4. 年齢</h2>
        <p>14歳未満の方はご利用いただけません。</p>

        <h2>5. お問い合わせ</h2>
        <p>az51826295@gmail.com</p>
        <p className="pv-date">これは翻訳です。韓国語の原文と異なる場合は、韓国語版が優先されます。</p>
    </>
  );
}
