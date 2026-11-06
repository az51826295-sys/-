import { redirect } from "next/navigation";

/**
 * **없앤 화면** (11-06 사장님 "타로도 없앤거지?"). 빈 자리로 두면 `/dot/[slug]` 가 집어서
 * *"그런 캐릭터가 없어요"* 가 된다 — 앱에 열어 둔 탭이나 북마크가 거기로 떨어진다.
 * 그래서 피드로 보낸다([[feature-removal-leaves-dead-ends]]).
 */
export default function TarotGone() {
  redirect("/dot/feed");
}
