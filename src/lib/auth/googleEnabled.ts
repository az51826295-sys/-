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

/**
 * **5분만 기억한다.** 로그인 화면은 새로 깐 사람이 처음 보는 자리라 느리면 안 된다
 * (두근도트는 "느림 = 첫 글자까지" 다). 그렇다고 영영 기억하면 사장님이 구글을 켜도
 * 단추가 안 돌아온다 — 5분이면 켠 뒤 금방 보이고, 평소엔 한 번만 묻는다.
 */
let 기억: { 때: number; 값: 구글상태 } | null = null;
const 기억시간 = 5 * 60 * 1000;

export async function 구글켜졌나(): Promise<구글상태> {
  if (기억 && Date.now() - 기억.때 < 기억시간) return 기억.값;
  const 값 = await 물어보기();
  /* 못 물어본 것은 기억하지 않는다 — 한 번 끊긴 것 때문에 5분간 단추가 사라지면 안 된다 */
  if (값.켜짐 || !값.까닭.startsWith("못 물어봤다")) 기억 = { 때: Date.now(), 값 };
  return 값;
}

async function 물어보기(): Promise<구글상태> {
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
