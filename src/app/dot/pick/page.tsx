import { redirect } from "next/navigation";

/**
 * 옛 **친구** 탭 — 09-29 에 **검색**으로 갈렸다(227회차, 사장님 방식 바꾸기).
 *
 * 화면은 지웠지만 주소는 남긴다. 앱·알림·옛 링크가 아직 `/dot/pick` 을 가리키고 있고,
 * 그쪽에서 오면 **없는 곳**이 아니라 대신할 화면으로 보내야 한다
 * (`src/proxy.ts` 도 같은 이유로 없는 도트 주소를 404 대신 첫 화면으로 보낸다).
 */
export default function DotPickMoved() {
  redirect("/dot/search");
}
