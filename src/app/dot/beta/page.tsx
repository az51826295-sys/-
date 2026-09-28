/**
 * **베타 테스터 들어오는 문** (226회차 09-28, 사장님 "배타테스터 모집 … 인스타로").
 *
 * 인스타는 **본문에 쓴 링크가 안 눌린다.** 그런데 들어오는 길은 세 단계다
 * (그룹 가입 → 테스트 동의 → 설치). 세 개를 글로 적어 두면 사람이 손으로 옮겨 적어야 한다 —
 * 거기서 대부분 떨어진다. 그래서 **프로필 링크 하나**가 이 페이지를 열고, 단추 세 개를 누르게 한다.
 *
 * **순서가 진짜로 중요하다.** 3번(스토어)은 2번(테스트 동의)을 해야 열린다 —
 * 09-28 에 로그인 없이 눌러 보니 **404** 였다. 비공개 테스트라 그런 것이고 고장이 아니지만,
 * 모르는 사람이 3번부터 누르면 "앱이 없네" 하고 나간다. 그래서 번호를 크게 매기고 이유를 적는다.
 *
 * 로그인 없이 열려야 한다(`src/proxy.ts` 의 열린 페이지 목록에 있다) — 모집 글을 보고 온 사람은
 * 아직 계정이 없다.
 */
import Link from "next/link";

export const metadata = {
  title: "두근도트 — 베타 테스터 모집",
  description: "두근도트 안드로이드 베타 테스터를 모집합니다. 세 단계면 설치됩니다.",
};

/** 사장님이 준 링크 셋. 순서가 곧 절차다. */
const 단계 = [
  {
    n: 1,
    제목: "구글 그룹 가입",
    설명: "테스터 명단이에요. 가입해야 다음 단계가 열려요.",
    링크: "https://groups.google.com/g/az51826295",
    단추: "그룹 가입하기",
  },
  {
    n: 2,
    제목: "테스트 참여 동의",
    설명: "1번을 한 구글 계정으로 열어 주세요. 여기서 '테스터가 되기'를 누르면 끝이에요.",
    링크: "https://play.google.com/apps/testing/azcom.example.myapp",
    단추: "참여 동의하기",
  },
  {
    n: 3,
    제목: "앱 설치",
    설명: "2번을 마쳐야 이 페이지가 열려요. 안 열리면 2번을 다시 확인해 주세요.",
    링크: "https://play.google.com/store/apps/details?id=azcom.example.myapp",
    단추: "플레이스토어에서 받기",
  },
];

export default function DotBeta() {
  return (
    <div className="bt-root">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      <style>{CSS}</style>
      <div className="bt-phone">
        <div className="bt-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/dot-icon-192.png" alt="두근도트" className="bt-icon" />
          <h1>두근도트 베타 테스터</h1>
          <p className="bt-sub">도트 캐릭터랑 카톡하듯 이야기하는 앱이에요.<br />지금 유나 · 서하 · 린 · 도윤 네 명이 있어요.</p>
        </div>

        <ol className="bt-steps">
          {단계.map((s) => (
            <li key={s.n}>
              <div className="bt-num">{s.n}</div>
              <div className="bt-body">
                <div className="bt-title">{s.제목}</div>
                <div className="bt-desc">{s.설명}</div>
                <a className="bt-go" href={s.링크} target="_blank" rel="noopener noreferrer">{s.단추}</a>
              </div>
            </li>
          ))}
        </ol>

        <div className="bt-note">
          <b>순서대로 해 주세요.</b> 3번은 2번을 마쳐야 열려요. 바로 3번을 누르면 “페이지를 찾을 수 없음”이 떠요.
          반영되는 데 몇 분 걸릴 때도 있어요.
        </div>

        <div className="bt-foot">
          잘 안 되면 <a href="mailto:az51826295@gmail.com?subject=두근도트 베타 테스터 문의">az51826295@gmail.com</a> 으로 알려 주세요.
          <br />
          <Link href="/dot/privacy">개인정보 처리방침</Link>
        </div>
      </div>
    </div>
  );
}

const CSS = `
* { box-sizing:border-box; }
.bt-root { min-height:100dvh; background:#0b0f14; display:flex; justify-content:center; font-family:"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing:antialiased; }
.bt-phone { width:100%; max-width:430px; min-height:100dvh; background:#fff; padding:40px 22px 48px; color:#141414; }
.bt-head { text-align:center; }
.bt-icon { width:76px; height:76px; image-rendering:pixelated; border-radius:22px; background:#eef2f6; }
.bt-head h1 { font-size:23px; font-weight:700; margin:14px 0 6px; letter-spacing:-.4px; }
.bt-sub { font-size:14px; line-height:1.7; color:#7b8590; margin:0 0 30px; }
.bt-steps { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:14px; }
.bt-steps li { display:flex; gap:13px; background:#f7f9fb; border-radius:16px; padding:16px 16px 18px; }
.bt-num { flex:0 0 28px; height:28px; border-radius:50%; background:#ff5c7a; color:#fff; font-size:14px; font-weight:700; display:flex; align-items:center; justify-content:center; }
.bt-body { flex:1; min-width:0; }
.bt-title { font-size:16px; font-weight:700; letter-spacing:-.2px; }
.bt-desc { font-size:13px; line-height:1.65; color:#6b747e; margin-top:4px; }
.bt-go { display:block; margin-top:12px; text-align:center; padding:12px; background:#fee500; color:#1f1a00; text-decoration:none; border-radius:12px; font-size:14px; font-weight:600; }
.bt-note { margin-top:22px; font-size:13px; line-height:1.75; color:#5c6570; background:#fff6e5; border-radius:14px; padding:14px 16px; }
.bt-note b { color:#141414; }
.bt-foot { margin-top:26px; font-size:13px; line-height:1.9; color:#8a919a; text-align:center; }
.bt-foot a { color:#111; font-weight:500; }
`;
