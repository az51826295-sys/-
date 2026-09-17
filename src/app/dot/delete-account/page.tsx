/**
 * 계정 삭제 안내 — Play 데이터 보안 설문이 요구하는 "삭제 요청 URL" (09-12).
 * 로그인 없이 열린다(proxy DOT_OPEN 의 /dot 아래이지만 requireLogin 예외에 넣었다).
 */
export const metadata = { title: "두근도트 — 계정 삭제" };

export default function DotDeleteAccount() {
  return (
    <div className="pv-root">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      <style>{CSS}</style>
      <div className="pv-phone">
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
