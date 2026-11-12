import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { todayKST } from "@/lib/dot/bond";
import { balanceFor } from "@/lib/dot/money";
import { devFromCookies } from "@/lib/dot/dev";
import CheckInPopup from "./CheckInPopup";

/**
 * 하루 첫 입장이면 출석 판을 띄우는 **문지기** (11-06). `/dot` 레이아웃에 있어서
 * 어느 화면으로 들어오든 — 피드든 방이든 — 같은 자리에서 뜬다.
 *
 * 로그인 안 했으면 안 뜬다(받을 것이 없다). 장부를 못 읽어도 조용히 빠진다 —
 * 판 하나 때문에 모든 화면이 죽으면 안 된다.
 *
 * 값: 머리의 하트 숫자(`HeartBadgeServer`)와 **따로** 잔고를 읽는다(한 쪽은 레이아웃, 한 쪽은
 * 화면이라 트리가 다르다). 세 줄짜리 읽기 하나가 더 느는 셈인데, 합치려면 컨텍스트를
 * 끼워야 해서 지금은 안 한다 — 느려지면 그때 잰다.
 */
export default async function CheckInGate() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    /* 11-13 개발자 링크면 `출석함` 이 참이라 이 판은 안 뜬다 — 받을 까닭이 없다. */
    const b = await balanceFor(createServiceClient(), user.id, todayKST(), await devFromCookies());
    if (b.출석함) return null;
    return <CheckInPopup name={null} />;
  } catch {
    return null;
  }
}
