/**
 * 계정 삭제 안내 — Play 데이터 보안 설문이 요구하는 "삭제 요청 URL" (97회차 09-13).
 * 로그인 없이 열린다. 두근도트는 `/dot/delete-account`(별도).
 */
export const metadata = { title: "로키 — 계정 삭제" };

export default function RookeryDeleteAccount() {
  return (
    <div className="pv-root">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      <style>{CSS}</style>
      <div className="pv-phone">
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
      </div>
    </div>
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
