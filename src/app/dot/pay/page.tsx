import { redirect } from "next/navigation";

/**
 * **없앤 화면** (11-06 구독 삭제). 파는 것이 없어서 결제창도 없앴다.
 * 빈 자리로 두면 `/dot/[slug]` 가 집어서 *"그런 캐릭터가 없어요"* 가 되므로 피드로 보낸다.
 */
export default function PayGone() {
  redirect("/dot/feed");
}
