import { createClient } from "@/lib/supabase/server";
import AskClient from "@/app/dashboard/ask/AskClient";
import AskShell from "./AskShell";

/**
 * 로그인 없이 열리는 대화.
 *
 * 링크를 연 사람이 **값어치를 보기 전에 가입을 요구받지 않는 것**이 이 경로의
 * 전부다. 로그인은 벽이 아니라 왼쪽 위 설정 안에 있고, "이어서 하시려면" 이다.
 */
export const metadata = { title: "물어보기" };

export default async function PublicAskPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <AskShell me={user ? { email: user.email ?? null } : null}>
      <AskClient />
    </AskShell>
  );
}
