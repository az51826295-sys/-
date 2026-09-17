import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { publicOrigin } from "@/lib/http/origin";
import { HANDOFF_TTL_MS, safeNext, sealHandoff } from "@/lib/auth/handoff";

export const dynamic = "force-dynamic";

/**
 * 폰으로 이어하기 — 로그인한 사람의 QR 을 만든다 (99회차).
 *
 * 서비스 클라이언트를 쓰는 드문 사용자 요청 문이다: 매직 링크는 관리 API 로만 만들 수 있다.
 * 그래서 범위를 좁힌다 — **세션으로 확인된 그 사람 자신의 이메일로만** 만든다. 요청 몸통의
 * 어떤 값도 누구의 링크를 만들지 정하지 못한다. 메일은 보내지 않는다(generateLink 는 발송 안 함).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return NextResponse.json({ error: "로그인한 계정에서만 폰으로 이어할 수 있어요." }, { status: 401 });

  let body: { conversationId?: unknown } = {};
  try { body = await request.json(); } catch { /* 몸통 없이도 된다 */ }
  let next = "/ask";
  if (typeof body.conversationId === "string") {
    // 내 대화일 때만 그 대화로 연다. 남의 대화 id 는 조용히 버리고 대화 화면으로.
    const { data: owned } = await supabase.from("conversations").select("id").eq("id", body.conversationId).eq("owner_id", user.id).maybeSingle();
    if (owned) next = safeNext(`/ask?c=${body.conversationId}`);
  }

  const { createServiceClient } = await import("@/lib/supabase/service");
  const { data, error } = await createServiceClient().auth.admin.generateLink({ type: "magiclink", email: user.email });
  if (error || !data?.properties?.hashed_token) return NextResponse.json({ error: "QR 을 만들지 못했어요. 잠시 뒤 다시 해 주세요." }, { status: 502 });

  const url = `${publicOrigin(request)}/auth/handoff?t=${sealHandoff(data.properties.hashed_token, next)}`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0a0a0a", light: "#ffffff" } });
  return NextResponse.json({ url, svg, expiresInSec: HANDOFF_TTL_MS / 1000 }, { headers: { "Cache-Control": "no-store" } });
}
