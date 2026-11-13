import Link from "next/link";

/**
 * **설치 페이지** (11-13 사장님 "일단 해야 하는 게 설치 페이지").
 *
 * 전에는 `/dot/beta` 하나였는데, 그건 **비공개 테스트 시절**의 세 단계다
 * (구글 그룹 가입 → 테스트 동의 → 설치). 앱은 10-21 에 **프로덕션 100%** 로 나갔으므로
 * 이제 그 세 단계는 **틀린 안내**다 — 아무나 스토어에서 바로 받을 수 있는데
 * 그룹부터 가입하라고 하면 거기서 떨어진다([[feature-removal-leaves-dead-ends]]).
 *
 * 그래서 이 페이지가 하는 일은 셋뿐이다: **뭐 하는 앱인지 한 줄**, **받는 단추**,
 * **안 받고 바로 해 보는 길**. 인스타 프로필 링크가 여기로 온다.
 *
 * ## 왜 "웹에서 바로" 를 같이 두나
 *
 * 설치는 마찰이 크다 — 스토어로 보내면 대부분 거기서 끝난다. 두근도트는 **웹이 본체**이고
 * (앱은 그 웹을 감싼 TWA다) 로그인 없이도 열린다. 그래서 "받기" 와 "그냥 해 보기" 를 같이 준다.
 *
 * 로그인 없이 열려야 한다 — 모집 글을 보고 온 사람은 아직 계정이 없다(`src/proxy.ts`).
 */

export const metadata = {
  title: "두근도트 — 받기",
  description: "도트 캐릭터와 카톡처럼 이야기하는 앱. 플레이스토어에서 받거나 웹에서 바로 해 보세요.",
};

const PLAY = "https://play.google.com/store/apps/details?id=azcom.example.myapp";

/**
 * 캐릭터 수·이름을 **DB 에서 읽는다**. 10-16 에 이 줄이 손으로 적혀 있다가
 * **없는 캐릭터(도윤)를 안내**한 적이 있다 — 손으로 적으면 늘 때마다 낡는다.
 */
const 글자수 = ["", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉", "열", "열한", "열두"];
async function 식구() {
  try {
    const { createServiceClient } = await import("@/lib/supabase/service");
    const { data } = await createServiceClient().from("dot_characters").select("name")
      .eq("is_public", true).order("created_at", { ascending: true });
    const 들 = (data ?? []).map((c) => c.name as string).filter(Boolean);
    if (!들.length) return null;   // 못 읽었으면 숫자를 꾸며 쓰지 않는다
    return { 줄: 들.join(" · "), 수: 글자수[들.length] ?? String(들.length) };
  } catch { return null; }
}

export default async function DotInstall() {
  const 식 = await 식구();
  return (
    <div className="in-root">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      <style>{CSS}</style>
      <div className="in-phone">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/dot-icon-192.png" alt="두근도트" className="in-icon" />
        <h1>두근도트</h1>
        <p className="in-sub">도트 캐릭터와 카톡처럼 이야기해요.<br />친해질수록 말투와 표정이 바뀌어요.</p>

        <a className="in-get" href={PLAY} target="_blank" rel="noopener noreferrer">플레이스토어에서 받기</a>
        <Link className="in-web" href="/dot">안 받고 웹에서 바로 해 보기</Link>

        <div className="in-shots">
          {[1, 2, 3].map((n) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={n} src={`/dot-shots/${n}.png`} alt={`두근도트 화면 ${n}`} loading="lazy" />
          ))}
        </div>

        {식 && (
          <div className="in-cast">
            <b>{식.수} 명이 기다려요</b>
            <span>{식.줄}</span>
          </div>
        )}

        <ul className="in-points">
          <li><b>하트로 이야기해요</b> — 하루 한 번 출석하면 하트 5개, 하트 하나에 한 마디</li>
          <li><b>같이 놀아요</b> — 끝말잇기 · 스무고개 · 초성퀴즈 · 두 진실 한 거짓</li>
          <li><b>묻지 않아요</b> — 이름 · 전화번호 · 위치 · 연락처 · 사진을 요구하지 않아요</li>
        </ul>

        <div className="in-foot">
          궁금한 건 <a href="mailto:az51826295@gmail.com?subject=두근도트 문의">az51826295@gmail.com</a>
          <br />
          <Link href="/dot/privacy">개인정보 처리방침</Link> · <Link href="/dot/child-safety">아동 안전</Link>
        </div>
      </div>
    </div>
  );
}

/* 누르는 자리는 44px 위(WCAG 2.5.5). 폰 한 손 폭(430px)에 맞춘다. */
const CSS = `
* { box-sizing:border-box; }
.in-root { min-height:100dvh; background:#0b0f14; display:flex; justify-content:center; font-family:"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing:antialiased; }
.in-phone { width:100%; max-width:430px; min-height:100dvh; background:#fff; padding:44px 22px 48px; color:#141414; text-align:center; }
.in-icon { width:84px; height:84px; image-rendering:pixelated; border-radius:24px; background:#eef2f6; }
.in-phone h1 { font-size:26px; font-weight:700; margin:14px 0 8px; letter-spacing:-.5px; }
.in-sub { font-size:14px; line-height:1.75; color:#7b8590; margin:0 0 26px; }
.in-get { display:block; min-height:52px; line-height:52px; background:#6b5bd2; color:#fff; text-decoration:none; border-radius:14px; font-size:16px; font-weight:700; }
.in-web { display:block; margin-top:10px; min-height:48px; line-height:48px; background:#fff; color:#3c434b; border:1px solid #d8dde3; border-radius:14px; font-size:14px; font-weight:600; text-decoration:none; }
.in-shots { display:flex; gap:10px; margin:28px -4px 0; overflow-x:auto; padding-bottom:6px; scroll-snap-type:x mandatory; }
.in-shots img { width:60%; flex:0 0 auto; border-radius:14px; border:1px solid #e7eaee; scroll-snap-align:center; }
.in-cast { margin-top:26px; background:#f7f9fb; border-radius:16px; padding:16px; }
.in-cast b { display:block; font-size:15px; margin-bottom:6px; }
.in-cast span { font-size:13px; line-height:1.8; color:#6b747e; }
.in-points { list-style:none; margin:18px 0 0; padding:0; text-align:left; display:flex; flex-direction:column; gap:10px; }
.in-points li { font-size:13px; line-height:1.7; color:#6b747e; background:#f7f9fb; border-radius:14px; padding:13px 15px; }
.in-points b { color:#141414; }
.in-foot { margin-top:28px; font-size:13px; line-height:1.9; color:#8a919a; }
.in-foot a { color:#111; font-weight:500; }
`;
