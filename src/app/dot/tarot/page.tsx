import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TarotClient from "./TarotClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "우리 사이 카드" };
export const viewport = {
  width: "device-width", viewportFit: "cover" as const, initialScale: 1, maximumScale: 1, userScalable: false, themeColor: "#1b1630",
};

/**
 * # 점집 — 일곱 사람과의 사이를 한 판에  (11-09 사장님 기획, "둘 다")
 *
 * 11-06 에 없앴던 `/dot/tarot` 자리를 **다른 뜻으로** 되살린다. 그때는 *하루 한 장* 운세였고
 * 블랙 덱이 구독 전용이었는데, 구독이 사라져 열 길이 없어졌다. 지금 것은 운세가 아니라
 * **그 사람과 나눈 대화를 읽은 관계 정리**다 — 친밀도 단계가 오를 때마다 한 판.
 *
 * 서버가 하는 일은 누구인지 보는 것뿐이고, 나머지는 `/api/dot/tarot` 가 센다.
 */
export default async function TarotPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="tr-root">
        <p className="tr-need">카드는 나눈 말에서 읽어요.<br />먼저 로그인하고 이야기해 보세요.</p>
        <Link className="tr-go" href="/dot/feed">피드로</Link>
      </div>
    );
  }
  return <TarotClient />;
}
