/**
 * **없는 캐릭터를 열면** (11-12).
 *
 * 11-12 01:2x 에 운영을 두드려 보니 `/dot/아무거나` 가 Next 의 영어 기본 화면을 띄웠다 —
 * `404 This page could not be found.` 글자 33자, 돌아갈 링크 **0개**. 한국어 앱에서 영어
 * 한 줄만 뜨고 길이 막히면 사람은 앱을 닫는다. `not-found.tsx` 가 **어디에도 없었다**.
 *
 * `/dot/[slug]/page.tsx` 와 `.../profile/page.tsx` 의 `notFound()` 가 이 화면으로 온다.
 * 이 파일은 `/dot` 칸에 둔다 — 로키 쪽 화면까지 도트 옷을 입히지 않기 위해서다
 * (앱 전체의 못 찾은 주소는 `app/not-found.tsx` 자리이고, 그건 두 제품이 같이 쓴다).
 *
 * 글귀는 초안이다. 캐릭터 말투가 아니라 **앱이 하는 말**로 짧게 적었다 — 사장님이 고친다.
 */
import Link from "next/link";
import { t } from "@/lib/dot/lang";
import { langFromCookie } from "@/lib/dot/langServer";

export default async function DotNotFound() {
  const lang = await langFromCookie();
  return (
    <div className="nf-root">
      <style>{CSS}</style>
      <div className="nf-box">
        <div className="nf-face" aria-hidden>···</div>
        <h1>{t("nf_title", lang)}</h1>
        <p>{t("nf_body", lang)}</p>
        <div className="nf-go">
          <Link href="/dot/pick" className="nf-btn nf-main">{t("nf_go_pick", lang)}</Link>
          <Link href="/dot/feed" className="nf-btn">{t("nf_go_feed", lang)}</Link>
        </div>
      </div>
    </div>
  );
}

/** 도트 옷을 맞춘다 — 설정·처리방침과 같은 색·같은 글꼴(갈무리는 레이아웃이 이미 싣는다). */
const CSS = `
.nf-root{min-height:100dvh;display:grid;place-items:center;background:#a5bccd;padding:24px;
  font-family:Galmuri11,system-ui,sans-serif;color:#2b3b47}
.nf-box{max-width:320px;text-align:center;background:#fff;border:3px solid #2b3b47;
  border-radius:4px;padding:28px 20px;box-shadow:4px 4px 0 #2b3b47}
.nf-face{font-size:28px;letter-spacing:4px;margin-bottom:10px;opacity:.55}
.nf-box h1{font-size:17px;margin:0 0 8px;line-height:1.5}
.nf-box p{font-size:13px;margin:0 0 20px;line-height:1.7;opacity:.75}
.nf-go{display:grid;gap:8px}
.nf-btn{display:block;padding:11px 14px;font-size:13px;text-decoration:none;color:#2b3b47;
  border:2px solid #2b3b47;border-radius:3px;background:#f3f6f8}
.nf-main{background:#ffd9e4}
.nf-btn:active{transform:translateY(1px)}
`;
