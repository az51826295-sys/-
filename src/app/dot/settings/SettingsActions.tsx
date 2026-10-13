"use client";
import { useT } from "@/lib/i18n/client";
import { DOT } from "@/lib/i18n/dict/dot";
import { useState } from "react";

/** 설정의 단추 둘 — 로그아웃, 계정 삭제. 계정 삭제는 대화방에 있던 것을 그대로 옮겼다(확인 두 번). */
export default function SettingsActions() {
  const t = useT(DOT);
  const [toast, setToast] = useState<string | null>(null);
  async function deleteAccount() {
    if (!window.confirm(t("계정을 지우면 대화·기억·친밀도가 전부 사라지고 되돌릴 수 없어요. 계속할까요?"))) return;
    const word = t("삭제");
    const typed = window.prompt(t("정말 지우려면 '{word}' 라고 적어 주세요.", { word }));
    if (typed?.trim().toLowerCase() !== word.toLowerCase()) { setToast(t("지우지 않았어요")); return; }
    const res = await fetch("/api/dot/account", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: "삭제" }) });
    if (res.ok) { window.location.href = "/login?message=" + encodeURIComponent(t("계정이 지워졌어요. 그동안 고마웠어요.")); }
    else setToast(t("지우지 못했어요. 잠시 뒤 다시 해 주세요"));
  }
  return (
    <>
      <form action="/api/auth/signout" method="post"><input type="hidden" name="next" value="/login" /><button type="submit" className="st-row">{t("로그아웃")}<small>{t("대화와 친밀도는 계정에 남아요")}</small></button></form>
      <button type="button" className="st-row danger" onClick={deleteAccount}>{t("계정 삭제")}<small>{t("되돌릴 수 없어요")}</small></button>
      {toast && <div className="st-row st-dim" role="status">{toast}</div>}
    </>
  );
}
