import { redirect } from "next/navigation";
import { cleanFrom } from "@/lib/dot/from";

/** 앱의 첫 화면은 **피드**다(09-12 사장님 "시작하자마자 피드를 보고 마음에 드는 애 있으면 채팅"). 채팅 목록은 /dot/chats.
 *  11-22: 홍보 꼬리표(?from=)는 넘겨준다 — 여기서 떨어지면 어디서 왔는지 영영 못 센다. */
export default async function DotHome({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const from = cleanFrom((await searchParams).from);
  redirect(from ? `/dot/feed?from=${from}` : "/dot/feed");
}
