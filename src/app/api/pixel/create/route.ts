import { linkedUserFrom } from "@/lib/dot/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { PIXEL_COST, pixelBalance, refundPixelShot, spendPixelShot } from "@/lib/pixel/credits";
import { dataUrl } from "@/lib/pixel/serve";
import { SIZES, cleanDesc, makeCharacter, type CanvasSize } from "@/lib/pixel/create";
import { gameImages } from "@/lib/pixel/serve";

/**
 * 글로 캐릭터 만들기(11-25). 그림 AI 값이 드니 미리보기가 없다 — 장을 먼저 쓰고 그린다.
 * 기계 검사에서 떨어지면(격자 없음·캐릭터 여럿·너무 작음) **쓴 장을 돌려준다.** 다시 그리지는 않는다(값을 아낀다).
 */
export const maxDuration = 120;

export async function POST(request: Request) {
  // 11-25 선결제 + 계정 연결: 손님(익명)은 AI 그림을 못 쓴다
  const who = await linkedUserFrom(request);
  if ("error" in who) return Response.json({ error: who.error, needLogin: true }, { status: who.status });
  const userId = who.id;
  const form = await request.formData().catch(() => null);
  const desc = cleanDesc(String(form?.get("desc") ?? ""));
  if (desc.length < 2) return Response.json({ error: "어떤 캐릭터인지 글로 적어 주세요." }, { status: 400 });
  const size = Number(form?.get("size")) as CanvasSize;
  if (!SIZES.includes(size)) return Response.json({ error: "크기를 골라 주세요." }, { status: 400 });
  const c = Number(form?.get("colors"));
  const colors = Number.isFinite(c) && c >= 2 && c <= 64 ? Math.round(c) : 32;
  // 게임 그림체(11-25): "game" 칸에 그 게임 그림 최대 4장. 장을 쓰기 전에 받아 본다(못 읽으면 돈 안 쓰고 400)
  const game = await gameImages(form);
  if ("error" in game) return Response.json({ error: game.error }, { status: 400 });
  const snap = form?.get("snap") === "1";

  const db = createServiceClient();
  if ((await pixelBalance(db, userId)) < PIXEL_COST.create) return Response.json({ error: "토큰이 모자라요.", need: true }, { status: 402 });
  const spent = await spendPixelShot(db, userId, `create ${size}${game.bufs.length ? " game" + game.bufs.length : ""} (그리는 중) ${new Date().toISOString()}`, PIXEL_COST.create);
  if (!spent) return Response.json({ error: "토큰이 모자라요.", need: true }, { status: 402 });

  const r = await makeCharacter(desc, size, { colors, game: game.bufs, snap });
  console.log(`[pixel/create] ${userId.slice(0, 8)} ${size} ok=${r.ok} usd=${r.usd.toFixed(4)} ${r.facts.join(" · ")}${r.ok ? "" : " · " + r.reason}`);
  if (!r.ok) {
    await refundPixelShot(db, userId, spent);
    return Response.json({ error: `캐릭터를 못 만들었어요 — 토큰은 돌려드렸어요. (${r.reason.slice(0, 120)})`, refunded: true }, { status: 422 });
  }
  await db.from("dot_purchases").update({ ref: `create ${size} $${r.usd.toFixed(4)} ${new Date().toISOString()}`.slice(0, 120) }).eq("id", spent);
  return Response.json({ ok: true, size, drawn: r.drawn, facts: r.facts, png: dataUrl(r.png), big: dataUrl(r.big), raw: dataUrl(r.raw), left: await pixelBalance(db, userId) });
}
