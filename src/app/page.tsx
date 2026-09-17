import Link from "next/link";
import { SKUS, TRIAL_USD, toCredits } from "@/lib/billing/plans";

/**
 * 정문 (100회차 09-13 다시 세움). 09-05 에는 "정문은 대화다" 로 여기서 /ask 로 바로 보냈다.
 *
 * 그런데 Paddle 사이트 심사가 두 번 "primary product is not a digital product or service" 로 돌려보냈다.
 * 심사자는 루트 주소를 열고, 한국어 대화창 하나만 보고, 번역기로 읽는다 — 무엇을 파는지 보여 주는 쪽이 없었다.
 * 그래서 루트에 **영어로** 제품을 설명하는 한 장을 둔다: 무엇인지, 무엇이 나오는지, 어떻게 쓰는지, 화면, 가격,
 * 그리고 "실물·사람 용역은 없다". 대화는 버튼 하나 뒤(/ask)에 그대로 있다.
 * 안드로이드 앱은 /ask 로 바로 열리고(launchUrl), 두근도트 서비스는 proxy 가 루트를 /dot 으로 보내므로 영향 없다.
 * 가격 숫자는 plans.ts 한 곳에서 온다.
 *
 * **140회차 09-16: Paddle 문장을 전부 걷어냈다.** 패들은 09-15 에 우리를 거절했다("generation of creative AI content"는
 * 셀프서브로 못 받는다). 그런데 정문·요금·약관·환불 네 곳에 "Paddle 이 판매자(Merchant of Record)" 가 그대로 떠 있었다.
 * 사실이 아닌 말이 공개 페이지에 있는 것도 문제고, 지금 Dodo 에 신청해 두고 답을 기다리는 중이라 **심사자가 보면 더 곤란하다.**
 * 결제가 안 열렸다는 것이 지금의 사실이고, 사실을 적어 두는 편이 언제나 낫다.
 */
export const metadata = {
  title: "Rookery — AI workspace for research, documents, small apps and videos",
  description:
    "Rookery is an AI software service (SaaS). Ask for research, documents, small web apps or short explainer videos, and AI models produce them automatically. Monthly plans with an AI usage allowance; cancel anytime.",
};

const FEATURES: { title: string; body: string }[] = [
  { title: "Research and analysis", body: "Competitor and market research, summaries of YouTube videos and web documents, with quoted sources." },
  { title: "Documents", body: "Reports, plans and structured write-ups generated from your request." },
  { title: "Small web apps and games", body: "Working HTML/JS tools and simple games, with automated checks and version history." },
  { title: "Short explainer videos", body: "About 60-second videos with script, AI voice and subtitles, delivered as an MP4 file." },
];

const STEPS: { title: string; body: string }[] = [
  { title: "Ask", body: "Type what you need in the chat. Quick questions are answered right away." },
  { title: "AI produces it", body: "Longer work is handed to AI agents, which generate the result automatically." },
  { title: "Review", body: "The result appears in the preview panel with versions. Approve it, or request a fix and the AI revises it." },
];

export default function Home() {
  return (
    <div className="lp-root">
      <style>{CSS}</style>
      <header className="lp-top">
        <span className="lp-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/rookery-icon-192.png" alt="" width={28} height={28} />
          Rookery
        </span>
        <nav className="lp-nav">
          <Link href="/pricing">요금</Link>
          <Link href="/login">로그인</Link>
        </nav>
      </header>

      <main className="lp-main">
        {/* 140회차: 한국어를 앞으로. 이 한 장이 영어였던 이유는 Paddle 심사자가 보기 때문이었는데(100회차),
            패들은 09-15 에 우리를 거절했다. 지금 이 페이지를 볼 사람은 **사장님이 링크를 건넬 한국 학생**이다.
            영어 설명은 아래에 그대로 남긴다 — 다음 결제 대행사 심사도 이 주소를 열어 볼 테니까. */}
        <section className="lp-hero">
          <h1>말로 시키면 끝난 파일로 돌려주는 AI.</h1>
          <p className="lp-lead">
            발표용 60초 설명 영상, 출처 달린 자료 정리, 간단한 웹 도구. 대화창에 말하면 로키가 여러 AI를 시켜 만들고,
            결과는 mp4·문서 같은 <b>진짜 파일</b>로 나와요. 이상한 곳을 말해 주면 그 부분만 다시 만들어요.
          </p>
          <div className="lp-cta">
            <Link href="/ask" className="lp-btn">그냥 써보기</Link>
            <Link href="/pricing" className="lp-link">요금 보기</Link>
          </div>
          <p className="lp-ko">가입은 이메일과 비밀번호만. <b>카드도, 결제 정보도 받지 않아요</b> — 지금은 무료 체험 크레딧으로만 써요.</p>
        </section>

        <section className="lp-hero lp-hero-en">
          <h2>An AI workspace that turns requests into finished digital work.</h2>
          <p className="lp-lead">
            Rookery is a software service (SaaS). You describe what you need, and AI models automatically produce research,
            documents, small web apps and short explainer videos. Everything is created by software and delivered digitally
            in your browser.
          </p>
        </section>

        <section className="lp-shots" aria-label="Screenshots">
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/rookery-shots/chat.png" alt="Rookery chat: the AI explains what it can produce" loading="lazy" />
            <figcaption>Ask in the chat. The AI answers or starts a task.</figcaption>
          </figure>
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/rookery-shots/result.png" alt="Rookery preview panel with a finished result, approve and request-fix buttons" loading="lazy" />
            <figcaption>Results land in the preview panel, with versions and approve / request fix.</figcaption>
          </figure>
        </section>

        <section>
          <h2>What Rookery produces</h2>
          <ul className="lp-grid">
            {FEATURES.map((f) => (
              <li key={f.title}>
                <b>{f.title}</b>
                <span>{f.body}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>How it works</h2>
          <ol className="lp-steps">
            {STEPS.map((s) => (
              <li key={s.title}>
                <b>{s.title}</b>
                <span>{s.body}</span>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2>Pricing</h2>
          <p>Monthly subscription for access to the software. Each plan includes a monthly AI usage allowance (credits) that renews every month; unused credits do not roll over. A typical task uses 30 to 40 credits. Cancel anytime.</p>
          <div className="lp-plans">
            {SKUS.map((s) => (
              <div className="lp-plan" key={s.id}>
                <span>
                  <b>{s.name}</b>
                  <em>{toCredits(s.usd).toLocaleString("en-US")} credits every month</em>
                </span>
                <strong>{s.priceLabelEn}</strong>
              </div>
            ))}
          </div>
          <p className="lp-note">
            New accounts get {toCredits(TRIAL_USD)} free trial credits, and you can use Rookery with them today — no card, no payment details.
            {" "}<b>Paid plans are not open yet.</b> The prices above are what they will be; we are still arranging a payment provider,
            and nothing is charged until that is in place.
          </p>
        </section>

        <section className="lp-plain">
          <h2>What we sell, plainly</h2>
          <p>
            We sell subscriptions to AI software. All results are generated by AI models and
            delivered digitally inside the app. We do not sell physical goods, shipping, or services performed by people.
            Subscriptions cover text and video work only — research, documents, small web apps and short explainer videos.
            Image generation and 3D model generation are not included in any paid plan.
          </p>
        </section>
      </main>

      <footer className="lp-foot">
        <Link href="/pricing">Pricing</Link>
        <Link href="/terms">Terms of service</Link>
        <Link href="/refund">Refund policy</Link>
        <Link href="/privacy">Privacy policy</Link>
        <a href="mailto:az51826295@gmail.com">Contact</a>
        <span className="lp-op">Rookery is operated by Kwon Hyeoksu, sole proprietor, Republic of Korea.</span>
      </footer>
    </div>
  );
}

const CSS = `
:root { --lp-bg:#0b0b0b; --lp-panel:#141414; --lp-line:#2a2a2a; --lp-ink:#f2f2f2; --lp-dim:#a3a3a3; --lp-accent:#E0703A; }
* { box-sizing:border-box; }
body { background:var(--lp-bg); }
.lp-root { min-height:100dvh; background:var(--lp-bg); color:var(--lp-ink); font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; -webkit-font-smoothing:antialiased; }
.lp-top { max-width:1040px; margin:0 auto; padding:20px 24px; display:flex; align-items:center; justify-content:space-between; gap:16px; }
.lp-brand { display:flex; align-items:center; gap:10px; font-weight:700; font-size:18px; }
.lp-brand img { image-rendering:pixelated; }
.lp-nav { display:flex; gap:20px; font-size:14px; }
.lp-nav a, .lp-foot a { color:var(--lp-dim); text-decoration:none; }
.lp-nav a:hover, .lp-foot a:hover { color:var(--lp-ink); }
.lp-main { max-width:1040px; margin:0 auto; padding:0 24px 64px; display:flex; flex-direction:column; gap:56px; }
.lp-hero { padding-top:32px; max-width:720px; }
.lp-hero h1 { font-size:clamp(28px, 4.2vw, 44px); line-height:1.15; letter-spacing:-.02em; margin:0 0 16px; text-wrap:balance; }
.lp-lead { font-size:17px; line-height:1.7; color:#d4d4d4; margin:0 0 24px; }
.lp-cta { display:flex; align-items:center; gap:20px; flex-wrap:wrap; }
.lp-btn { background:var(--lp-accent); color:#0b0b0b; font-weight:700; padding:12px 22px; text-decoration:none; border:2px solid var(--lp-accent); }
.lp-btn:hover { filter:brightness(1.08); }
.lp-btn:focus-visible, .lp-link:focus-visible, .lp-nav a:focus-visible, .lp-foot a:focus-visible { outline:2px solid var(--lp-ink); outline-offset:3px; }
.lp-link { color:var(--lp-ink); text-decoration:underline; }
.lp-ko { margin:20px 0 0; font-size:13px; color:var(--lp-dim); }
/* 140회차: 영어 설명은 남기되 뒤로 — 이 주소를 볼 사람은 한국 학생이 먼저고, 심사자는 그 다음이다. */
.lp-hero-en { opacity:.62; padding-top:0; }
.lp-hero-en h2 { font-size:1.1rem; font-weight:600; margin:0 0 8px; }
.lp-shots { display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:20px; }
.lp-shots figure { margin:0; background:var(--lp-panel); border:1px solid var(--lp-line); }
.lp-shots img { display:block; width:100%; height:auto; }
.lp-shots figcaption { padding:10px 14px; font-size:13px; color:var(--lp-dim); }
h2 { font-size:22px; margin:0 0 16px; letter-spacing:-.01em; }
section p { font-size:15px; line-height:1.7; color:#d4d4d4; margin:0 0 12px; max-width:68ch; }
.lp-grid { list-style:none; padding:0; margin:0; display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:12px; }
.lp-grid li, .lp-steps li { background:var(--lp-panel); border:1px solid var(--lp-line); padding:16px; display:flex; flex-direction:column; gap:6px; }
.lp-grid b, .lp-steps b { font-size:15px; }
.lp-grid span, .lp-steps span { font-size:14px; line-height:1.6; color:var(--lp-dim); }
.lp-steps { list-style:none; padding:0; margin:0; display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:12px; counter-reset:step; }
.lp-steps li b::before { counter-increment:step; content:counter(step) ". "; color:var(--lp-accent); }
.lp-plans { display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px; margin:8px 0 12px; max-width:560px; }
.lp-plan { display:flex; justify-content:space-between; align-items:baseline; gap:12px; border:2px solid var(--lp-ink); padding:14px 16px; }
.lp-plan strong { font-variant-numeric:tabular-nums; white-space:nowrap; }
.lp-plan span { display:flex; flex-direction:column; gap:2px; }
.lp-plan em { font-style:normal; font-size:13px; color:var(--lp-dim); }
.lp-op { color:var(--lp-dim); flex-basis:100%; }
.lp-note { font-size:13px !important; color:var(--lp-dim) !important; }
.lp-plain { border-left:3px solid var(--lp-accent); padding-left:16px; }
.lp-foot { max-width:1040px; margin:0 auto; padding:24px; border-top:1px solid var(--lp-line); display:flex; flex-wrap:wrap; gap:20px; font-size:13px; }
`;
