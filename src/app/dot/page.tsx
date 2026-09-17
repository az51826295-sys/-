import { redirect } from "next/navigation";

/** 앱의 첫 화면은 **피드**다(09-12 사장님 "시작하자마자 피드를 보고 마음에 드는 애 있으면 채팅"). 채팅 목록은 /dot/chats. */
export default function DotHome() {
  redirect("/dot/feed");
}
