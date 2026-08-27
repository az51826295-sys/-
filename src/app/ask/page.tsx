import { createClient } from "@/lib/supabase/server";
import AskClient from "@/app/dashboard/ask/AskClient";
import AskShell from "./AskShell";
import { loadConversation } from "@/lib/chat/conversations";

/**
 * 로그인 없이 열리는 대화.
 *
 * 링크를 연 사람이 **값어치를 보기 전에 가입을 요구받지 않는 것**이 이 경로의
 * 전부다. 로그인은 벽이 아니라 왼쪽 위 설정 안에 있고, "이어서 하시려면" 이다.
 */
export const metadata = { title: "물어보기" };

export default async function PublicAskPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 저장된 대화를 열고 들어올 수 있다. 남의 대화 id 를 넣어도 loadConversation
  // 이 소유자로 걸러 null 을 주므로, 그때는 그냥 새 대화가 된다.
  const { c } = await searchParams;
  let initial: { id: string; turns: { role: "user" | "assistant"; content: string }[] } | null =
    null;
  if (c && user) {
    const found = await loadConversation(supabase, user.id, c);
    if (found) {
      initial = {
        id: found.conversation.id as string,
        turns: (found.messages as { role: string; content: string }[]).map((m) => ({
          role: m.role === "user" ? "user" : "assistant",
          content: m.content,
        })),
      };
    }
  }

  return (
    <AskShell me={user ? { email: user.email ?? null } : null}>
      <AskClient initial={initial} />
    </AskShell>
  );
}
