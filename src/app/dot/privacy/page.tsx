/**
 * 개인정보 처리방침 — 스토어 등록에 필수(38회차, 09-11).
 *
 * 문구는 초안이다. 이 앱이 실제로 하는 것만 적었다(모아 두는 것·쓰는 곳·지우는 법). 사장님이 읽고 고친다.
 * 법률 자문이 아니다 — 등록 전에 한 번은 사람이 봐야 한다.
 */
import { realAdsenseClient } from "@/lib/dot/money";

export const metadata = { title: "두근도트 — 개인정보 처리방침" };

/**
 * **광고 문단은 광고가 있을 때만 적는다** (11-10).
 *
 * AdSense 정책은 "제3자가 쿠키를 쓴다" 를 처리방침에 적을 것을 요구한다 — 안 적으면 심사에서
 * 걸린다. 그런데 **광고가 없는 지금** 적으면 그건 거짓이다(안 뜨는 광고를 뜬다고 적는 꼴).
 * 그래서 `ADSENSE_CLIENT` 가 들어오는 순간 **같이 켜지게** 묶어 둔다 — 사람이 기억해서 고칠
 * 일을 안 남긴다([[feature-removal-leaves-dead-ends]]).
 */
const 광고켜짐 = !!realAdsenseClient();

export default function DotPrivacy() {
  return (
    <div className="pv-root">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      <style>{CSS}</style>
      <div className="pv-phone">
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
          <li>대화 내용은 AI 언어 모델 제공사(DeepSeek)에 <b>답을 만들기 위해</b> 전송됩니다. 판매하지 않으며, <b>광고를 고르는 데 쓰지 않습니다</b>.</li>
          <li>데이터는 Supabase(싱가포르 리전)에 저장됩니다.</li>
        </ul>

        <h2>3. 지우는 법</h2>
        <ul>
          <li>대화방 메뉴(⋮) → <b>대화 내용 지우기</b>: 그 캐릭터와의 대화가 지워집니다.</li>
          <li>대화방 메뉴(⋮) → <b>계정 삭제</b>: 계정·대화·기억·친밀도·알림 주소가 <b>즉시, 전부</b> 지워지며 되돌릴 수 없습니다.</li>
        </ul>

        <h2>4. 연령</h2>
        <p>만 14세 미만은 이용할 수 없습니다.</p>

        {광고켜짐 ? (
          <>
            <h2>5. 광고</h2>
            <ul>
              <li>하트를 채우려고 <b>광고 보기</b>를 누르면 Google(AdSense)이 광고를 보여 줍니다. 누르지 않으면 광고는 뜨지 않습니다.</li>
              <li>Google과 그 협력사는 광고를 고르고 중복을 줄이기 위해 <b>쿠키</b>를 쓸 수 있습니다. 여기에는 기기·브라우저 정보와 대략적인 위치(국가 수준)가 포함될 수 있습니다.</li>
              <li>맞춤 광고는 <a href="https://adssettings.google.com" target="_blank" rel="noreferrer noopener">Google 광고 설정</a>에서 끌 수 있습니다. 끄면 광고는 계속 뜨지만 맞춤이 아닙니다.</li>
              <li><b>대화 내용·친밀도·기억은 광고사에 전달되지 않습니다.</b></li>
            </ul>
          </>
        ) : null}

        <h2>{광고켜짐 ? 6 : 5}. 문의</h2>
        <p>az51826295@gmail.com</p>
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
