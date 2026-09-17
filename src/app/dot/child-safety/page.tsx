/** 아동 안전 표준(CSAE) — Play 콘솔 아동 안전 선언이 요구하는 공개 페이지. 로그인 없이 열린다(proxy 예외). */
export const metadata = { title: "두근도트 — 아동 안전 표준" };

export default function DotChildSafety() {
  return (
    <div className="pv-root">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      <style>{CSS}</style>
      <div className="pv-phone">
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
