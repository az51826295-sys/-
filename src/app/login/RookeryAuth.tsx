import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { ROOKERY } from "@/lib/i18n/dict/rookery";

/**
 * 로키 로그인·가입 화면 (99회차 09-13). 전엔 영어("Log in")·흰 화면이라 검은 로키 앱 안에서 딴 회사 페이지처럼 보였다.
 * 로키의 색(검정·주황 #E0703A)과 한국어로. 폰에서 처음 여는 사람에게 "컴퓨터에서 쓰고 있다면 QR 로" 를 먼저 알려 준다 —
 * 폰에서 비밀번호를 치는 게 이 화면에서 가장 귀찮은 일이라서.
 */
export default async function RookeryAuth({
  mode,
  action,
  error,
  message,
  google,
  origin,
}: {
  mode: "login" | "signup";
  action: (formData: FormData) => void | Promise<void>;
  error?: string;
  message?: string;
  /**
   * **구글로 들어가기** (228회차 10-03). 두근도트엔 있고 로키엔 없었다 — 그래서 구글 계정만 쓰는 사람은
   * 로키 웹에 **아예 못 들어왔다**(10-03 에 사장님이 결제 시험을 못 한 까닭이 이것이었다).
   * 안 켜졌으면(`google` 이 없으면) 지금 화면 그대로 — 켜다 말면 아무도 못 드는 쪽이 더 나쁘다.
   */
  google?: (formData: FormData) => Promise<void>;
  origin?: string;
}) {
  const isLogin = mode === "login";
  const t = await getT(ROOKERY);
  return (
    <div className="flex min-h-dvh flex-1 items-center justify-center bg-[var(--rk-paper)] px-4 py-12 text-[var(--rk-ink)]">
      <div className="w-full max-w-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/rookery-icon-192.png" alt="" className="mb-4 h-12 w-12" style={{ imageRendering: "pixelated" }} />
        <h1 className="text-2xl font-bold">{isLogin ? t("로키에 로그인") : t("로키 시작하기")}</h1>
        <p className="mt-1 text-sm text-[var(--rk-600)]">{isLogin ? t("대화와 결과물은 계정에 저장돼요.") : t("계정을 만들면 대화와 결과물이 저장돼요.")}</p>

        {google && (
          <form action={google} className="mt-5">
            <input type="hidden" name="origin" value={origin ?? ""} />
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 border-2 border-[var(--rk-ink)] bg-[var(--rk-ink)] px-3 py-2.5 text-sm font-bold text-[var(--rk-paper)]"
            >
              <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-[13px] font-black text-[#4285F4]">G</span>
              {isLogin ? t("구글로 들어가기") : t("구글로 시작하기")}
            </button>
            <div className="mt-3 text-center text-[11px] text-[var(--rk-400)]">{t("또는 이메일로")}</div>
          </form>
        )}

        {isLogin && (
          <div className="mt-5 border-2 border-[#E0703A] px-3 py-2.5 text-[12.5px] leading-relaxed">
            <b>{t("컴퓨터에서 이미 쓰고 있다면")}</b>{t(" — 컴퓨터 로키의 왼쪽 위 메뉴 → ")}<b>{t("폰으로 이어하기")}</b>{t(" → 뜬 QR 을 폰 카메라로 찍으세요. 비밀번호가 필요 없어요.")}
          </div>
        )}
        {message && <p className="mt-4 border-l-4 border-[#7ED9A0] bg-[var(--rk-100)] px-3 py-2 text-sm">{message}</p>}
        {error && <p className="mt-4 border-l-4 border-[#E07070] bg-[var(--rk-100)] px-3 py-2 text-sm">{error}</p>}

        <form action={action} className="mt-6 flex flex-col gap-4">
          <label className="block text-sm">
            {t("이메일")}
            <input name="email" type="email" required autoComplete="email"
              className="mt-1 w-full border-2 border-[var(--rk-200)] bg-[var(--rk-100)] px-3 py-2 text-sm text-[var(--rk-ink)] focus:border-[#E0703A] focus:outline-none" />
          </label>
          <label className="block text-sm">
            {t("비밀번호")}
            <input name="password" type="password" required minLength={isLogin ? undefined : 6} autoComplete={isLogin ? "current-password" : "new-password"}
              className="mt-1 w-full border-2 border-[var(--rk-200)] bg-[var(--rk-100)] px-3 py-2 text-sm text-[var(--rk-ink)] focus:border-[#E0703A] focus:outline-none" />
          </label>
          <button type="submit" className="mt-2 border-2 border-[#E0703A] bg-[#E0703A] px-4 py-2.5 text-sm font-bold text-[var(--rk-paper)]">
            {isLogin ? t("로그인") : t("가입하기")}
          </button>
        </form>

        <p className="mt-6 text-sm text-[var(--rk-600)]">
          {isLogin ? t("계정이 없나요? ") : t("이미 계정이 있나요? ")}
          <Link href={isLogin ? "/signup" : "/login"} className="font-bold text-[var(--rk-ink)] underline">{isLogin ? t("가입하기") : t("로그인")}</Link>
          <span className="mx-2">·</span>
          <Link href="/ask" className="underline">{t("로그인 없이 써 보기")}</Link>
        </p>
        {/* 100회차: Paddle 판매자 심사는 사이트에서 약관·개인정보·환불로 가는 길을 본다. */}
        <p className="mt-8 text-[11px] text-[var(--rk-400)]">
          <Link href="/pricing" className="underline">{t("요금")}</Link>
          <span className="mx-1.5">·</span>
          <Link href="/terms" className="underline">{t("이용약관")}</Link>
          <span className="mx-1.5">·</span>
          <Link href="/refund" className="underline">{t("환불 정책")}</Link>
          <span className="mx-1.5">·</span>
          <Link href="/privacy" className="underline">{t("개인정보 처리방침")}</Link>
        </p>
      </div>
    </div>
  );
}
