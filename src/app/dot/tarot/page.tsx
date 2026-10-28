import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { balanceFor } from "@/lib/dot/money";
import { dayKey } from "@/lib/dot/tarot";
import TarotClient from "./TarotClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "오늘의 카드" };
export const viewport = {
  width: "device-width", viewportFit: "cover" as const, initialScale: 1, maximumScale: 1, userScalable: false, themeColor: "#12101a",
};

/**
 * **하루 한 장 타로** (10-28 사장님 기획 3번).
 *
 * 서버가 하는 일은 **둘뿐**이다: 누구인지와 구독 중인지.
 * 카드는 (사람, 날짜)의 함수라 화면에서 그대로 계산한다 — 서버 왕복도, 표도 없다.
 *
 * **로그인 없이 들어온다.** 10-28 에 로그인을 문에서 내렸으므로 `user` 가 없을 수 있고,
 * 그때는 화면이 이 기기에 붙는 id 를 쓴다. 여기서 `/login` 으로 보내지 않는다 —
 * 매일 올 이유를 만들려는 화면이 문부터 세우면 뜻이 없다.
 */
export default async function TarotPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let menhera = false;
  if (user) {
    try {
      const b = await balanceFor(createServiceClient(), user.id, dayKey());
      menhera = b.구독중;
    } catch {
      /* 장부를 못 읽은 것은 "구독 안 함" 이 아니다. 다만 화면은 하나를 골라야 하므로
         잠긴 쪽으로 둔다 — 열어 두면 안 산 사람이 블랙 덱을 보게 된다. */
      menhera = false;
    }
  }

  return <TarotClient userId={user?.id ?? null} menhera={menhera} />;
}
