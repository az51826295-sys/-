/**
 * 개인정보 처리방침 (로키, 97회차 09-13) — 구글 플레이 등록 필수.
 * 두근도트는 `/dot/privacy`(별도 초안). 이 페이지는 로키(/ask) 것.
 * 로그인 없이 열려야 한다 — proxy.ts 는 PRODUCT=rookery 서비스에서 로그인을 강제하지 않는다.
 * 법률 자문이 아니다 — 등록 전에 한 번은 사람이 봐야 한다.
 */
export const metadata = { title: "로키 — 개인정보 처리방침" };

export default function RookeryPrivacy() {
  return (
    <div className="pv-root">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      <style>{CSS}</style>
      <div className="pv-phone">
        <a href="/ask" className="pv-back">‹ 돌아가기</a>
        <h1>개인정보 처리방침</h1>
        <p className="pv-date">시행일 2026-09-13 (초안)</p>

        <h2>1. 모아 두는 것</h2>
        <ul>
          <li><b>계정</b>: 이메일, 비밀번호(암호화된 형태로만) 또는 구글 로그인 정보.</li>
          <li><b>대화·업무</b>: 질문·답, 만들어 달라고 시킨 업무와 그 결과물(문서·이미지·코드 등 업로드·생성한 파일 포함).</li>
          <li><b>회사·AI 에이전트 설정</b>: 만든 회사 이름, 사용한 AI 에이전트 구성.</li>
          <li><b>사용 기록</b>: 요청 처리 시간, 어떤 AI 모델로 처리됐는지(서비스 개선·비용 관리용).</li>
          <li>이 앱은 전화번호·위치·연락처를 요구하지 않습니다.</li>
        </ul>

        <h2>2. 어디에 쓰나</h2>
        <ul>
          <li>질문에 답하고 시킨 업무를 실제로 수행하는 데 씁니다.</li>
          <li>대화·업무 내용은 답이나 결과물을 만들기 위해 AI 모델 제공사(Anthropic, 필요 시 다른 생성 AI)에 <b>전송</b>됩니다. 광고·판매 목적으로 제3자에게 넘기지 않습니다.</li>
          <li>데이터는 Supabase에 저장됩니다.</li>
        </ul>

        <h2>3. 지우는 법</h2>
        <ul>
          <li>왼쪽 위 계정 메뉴 → <b>계정 삭제</b>: 계정·대화·회사·AI 에이전트 설정·산출물이 <b>즉시, 전부</b> 지워지며 되돌릴 수 없습니다.</li>
          <li>로그인이 안 될 때는 <a href="/delete-account">/delete-account</a> 안내를 참고하세요.</li>
        </ul>

        <h2>4. 연령</h2>
        <p>만 14세 미만은 이용할 수 없습니다.</p>

        <h2>5. 문의</h2>
        <p>az51826295@gmail.com</p>
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
ul { padding-left:18px; margin:0; }
a { color:#E0703A; }
`;
