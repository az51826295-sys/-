import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { todayKST } from "@/lib/dot/bond";
import { balanceFor } from "@/lib/dot/money";
import HeartBadge from "./HeartBadge";

/**
 * 하트 수를 **머리에 붙이는 조각** — 화면마다 잔고를 다시 세는 코드를 쓰지 않으려고 하나로 꺼냈다.
 *
 * 로그인 안 한 사람에게는 **아무것도 안 그린다**: 받을 하트도 쓸 하트도 없는데 숫자만 보이면
 * 못 하는 일을 보여 주는 자리가 된다([[feature-removal-leaves-dead-ends]]).
 * 장부를 못 읽으면 조용히 빠진다 — 머리글 하나 때문에 화면이 죽으면 안 된다.
 */
export default async function HeartBadgeServer() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const b = await balanceFor(createServiceClient(), user.id, todayKST());
    return <HeartBadge hearts={Number.isFinite(b.remaining) ? b.remaining : 0} />;
  } catch {
    return null;
  }
}
