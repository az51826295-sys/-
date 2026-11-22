import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * **산 하트를 지갑에 넣는 단 하나의 자리** (11-22 — 앱 결제(Play)와 웹 결제(Polar)가 같이 쓴다).
 *
 * 원래 `/api/dot/buy` 안에 있던 걸 꺼냈다. 주는 자리가 둘이면 언젠가 다르게 준다.
 *
 * 번호표는 `dot_purchases.ref` (+ `source`). 두 걸음으로 적는다:
 *  1. `credits: 0` 으로 먼저 자리를 찜한다
 *  2. 지갑을 CAS 로 올린 뒤 그 줄의 `credits` 를 진짜 수로 고친다
 * 중간에 끊기면 `credits: 0` 줄이 남는다 = "돈은 받았고 하트는 아직" → 다시 부르면 이어서 올린다.
 * 이미 `credits > 0` 이면 아무것도 안 하고 `already: true`.
 */
export async function grantHearts(
  db: SupabaseClient,
  a: { userId: string; hearts: number; sku: string; source: string; ref: string },
): Promise<{ ok: true; already: boolean } | { ok: false; error: string; status: number }> {
  const { data: 있던 } = await db
    .from("dot_purchases").select("id, credits").eq("ref", a.ref).eq("source", a.source).maybeSingle();
  if (있던 && Number(있던.credits) > 0) return { ok: true, already: true };

  let 줄id = 있던?.id as number | undefined;
  if (!줄id) {
    const { data: 새줄, error } = await db
      .from("dot_purchases")
      .insert({ user_id: a.userId, sku: a.sku, credits: 0, menhera_days: 0, source: a.source, ref: a.ref })
      .select("id").single();
    if (error) return { ok: false, error: error.message, status: 500 };
    줄id = 새줄.id as number;
  }

  let 올림 = false;
  for (let 판 = 0; 판 < 3 && !올림; 판++) {
    await db.from("dot_wallet").upsert({ user_id: a.userId, credits: 0 }, { onConflict: "user_id", ignoreDuplicates: true });
    const { data: 지금 } = await db.from("dot_wallet").select("credits").eq("user_id", a.userId).maybeSingle();
    const 전 = Number(지금?.credits ?? 0);
    const { data: 뒤 } = await db
      .from("dot_wallet").update({ credits: 전 + a.hearts, updated_at: new Date().toISOString() })
      .eq("user_id", a.userId).eq("credits", 전).select("credits");
    올림 = (뒤?.length ?? 0) > 0;
  }
  if (!올림) return { ok: false, error: "충전이 밀렸어요. 다시 눌러 주세요.", status: 503 };

  await db.from("dot_purchases").update({ credits: a.hearts }).eq("id", 줄id);
  return { ok: true, already: false };
}
