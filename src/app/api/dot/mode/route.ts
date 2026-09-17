import { userIdFrom } from "@/lib/dot/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { MODES, type Mode } from "@/lib/dot/bond";

/**
 * 멘헤라 모드 켜기/끄기 — 사이(bond) 하나에 붙는다.
 *
 * **유료다**(09-11 사장님 "멘헤라 모드는 돈 내고 쓰는 거야"). 자격은 `dot_entitlements.menhera_until` — 스토어 결제가 붙기 전엔
 * `engine/tools/dot_grant_menhera.mts <이메일> <일수>` 로 사장님이 준다. 자격 없이 켜려 하면 402 와 함께 값을 알려 준다.
 */
export async function POST(request: Request) {
  const userId = await userIdFrom(request);
  if (!userId) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { characterId?: string; mode?: string };
  const characterId = body.characterId ?? "";
  const mode = body.mode as Mode;
  if (!characterId) return Response.json({ error: "characterId 가 필요해요." }, { status: 400 });
  if (!MODES.includes(mode)) return Response.json({ error: "그런 모드는 없어요." }, { status: 400 });

  const db = createServiceClient();
  if (mode === "menhera") {
    const { data: ent } = await db.from("dot_entitlements").select("menhera_until").eq("user_id", userId).maybeSingle();
    const until = ent?.menhera_until ? Date.parse(ent.menhera_until as string) : 0;
    if (until < Date.now()) return Response.json({ error: "멘헤라 모드는 유료예요.", paywall: true, price: process.env.MENHERA_PRICE ?? "월 4,900원" }, { status: 402 });
  }
  // 아직 한 번도 말 안 한 사이면 줄을 만든다(점수 0). 켠 순간부터 먼저 말 걸기가 이 줄을 본다.
  const { error } = await db.from("dot_bonds").upsert({ user_id: userId, character_id: characterId, mode }, { onConflict: "user_id,character_id" });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, mode });
}
