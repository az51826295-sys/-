import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { todayKST } from "@/lib/dot/bond";
import { balanceFor, adConfFromEnv, heartBillingOpen } from "@/lib/dot/money";
import { devFromCookies } from "@/lib/dot/dev";
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
    const b = await balanceFor(createServiceClient(), user.id, todayKST(), await devFromCookies());
    /* 광고 설정은 **서버만 안다**(스위치 + 광고주 번호). 둘 중 하나라도 없으면 null 이 가고
       시트에 광고 줄을 안 그린다 — 켜졌다고 넘겨짚지 않는다. 번호를 화면으로 넘기는 까닭은
       `adConfFromEnv()` 주석에 적어 뒀다(빌드에 박히지 않게). */
    return (
      <HeartBadge
        hearts={Number.isFinite(b.remaining) ? b.remaining : 0}
        무제한={!!b.무제한}
        파는중={heartBillingOpen()}
        ad={adConfFromEnv()}
        adLeft={b.adLeft}
      />
    );
  } catch {
    return null;
  }
}
