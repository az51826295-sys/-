/**
 * **구글 로그인이 실제로 켜져 있나** — 한 곳에서만 묻는다 (10-24).
 *
 * 10-24 에 두근도트를 새 Supabase 프로젝트로 옮기고 나서 사장님이 구글 단추를 눌렀더니
 * 화면에 **생 JSON** 이 떴다:
 *   `{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}`
 *
 * 까닭: `signInWithOAuth()` 는 **주소를 만들어 줄 뿐** 켜졌는지 안 본다. 그래서 코드의
 * `if (error)` 는 한 번도 안 걸리고, 브라우저가 그 주소로 가서야 Supabase 가 거절한다.
 * **자료는 옮겨도 Auth 설정은 안 따라온다** — 이사하면 반드시 다시 켜야 한다.
 *
 * 그래서 보내기 전에 한 번 물어본다. 못 물어보면 **켜졌다고 하지 않는다**(0 을 "없다" 로
 * 읽지 않는 것과 같은 결) — 대신 왜 못 물었는지를 같이 돌려준다.
 */
export type 구글상태 = { 켜짐: boolean; 까닭: string };

export async function 구글켜졌나(): Promise<구글상태> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return { 켜짐: false, 까닭: "Supabase 주소가 없다" };
  try {
    const r = await fetch(`${base}/auth/v1/authorize?provider=google`, { redirect: "manual" });
    /* 켜져 있으면 구글 동의 화면으로 **넘겨 준다**. 꺼져 있으면 400 과 함께 그 JSON 이 온다. */
    const loc = r.headers.get("location") ?? "";
    const 켜짐 = r.status >= 300 && r.status < 400 && loc.includes("google");
    return { 켜짐, 까닭: 켜짐 ? "켜져 있다" : `안 켜졌다 (HTTP ${r.status})` };
  } catch (e) {
    return { 켜짐: false, 까닭: `못 물어봤다: ${e instanceof Error ? e.message.slice(0, 60) : String(e)}` };
  }
}

/** 사람에게 보일 말. 기술 용어를 그대로 내밀지 않는다. */
export const 구글꺼짐말 = "지금은 구글 로그인을 쓸 수 없어요. 이메일로 들어와 주세요.";
