"use client";
import { useState } from "react";
import { t, type Lang } from "@/lib/dot/lang";

/**
 * 설정의 단추 둘 — 로그아웃, 계정 삭제. 계정 삭제는 대화방에 있던 것을 그대로 옮겼다(확인 두 번).
 *
 * **로그인 안 한 사람에게는 둘 다 안 보인다** (10-28 화면 점검). 오늘 로그인 화면을
 * 없앴더니 설정에 "로그인 안 됨" 밑으로 *로그아웃* 과 *계정 삭제* 가 그대로 떠 있었다 —
 * 없는 계정을 지우라는 단추다. 지울 것이 없는 사람에게 "되돌릴 수 없어요" 는 겁만 준다.
 */
export default function SettingsActions({ signedIn, lang = "ko" }: { signedIn: boolean; lang?: Lang }) {
  if (!signedIn) return null;
  const [toast, setToast] = useState<string | null>(null);
  async function deleteAccount() {
    if (!window.confirm("계정을 지우면 대화·기억·친밀도가 전부 사라지고 되돌릴 수 없어요. 계속할까요?")) return;
    const typed = window.prompt("정말 지우려면 '삭제' 라고 적어 주세요.");
    if (typed !== "삭제") { setToast("지우지 않았어요"); return; }
    const res = await fetch("/api/dot/account", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: "삭제" }) });
    if (res.ok) { window.location.href = "/dot?message=" + encodeURIComponent("계정이 지워졌어요. 그동안 고마웠어요."); }
    else setToast("지우지 못했어요. 잠시 뒤 다시 해 주세요");
  }
  return (
    <>
      <form action="/api/auth/signout" method="post"><input type="hidden" name="next" value="/dot" /><button type="submit" className="st-row">{t("st_signout", lang)}<small>{lang === "en" ? "Your chats and closeness stay on the account" : "대화와 친밀도는 계정에 남아요"}</small></button></form>
      <button type="button" className="st-row danger" onClick={deleteAccount}>{t("st_delete", lang)}<small>{t("st_delete_sub", lang)}</small></button>
      {toast && <div className="st-row st-dim" role="status">{toast}</div>}
    </>
  );
}
